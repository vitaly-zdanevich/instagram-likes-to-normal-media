import { InstagramClient } from './instagram.ts';
import { copyRichWithDocument } from './clipboard.ts';
import { LikesEnhancer } from './ui.ts';

declare const GM_setClipboard: ((text: string, type?: string) => void) | undefined;
declare const GM_download: ((url: string, name: string) => void) | undefined;
declare const unsafeWindow: Window | undefined;

/** Starts the userscript with the authenticated page's own fetch implementation. */
export function start(): LikesEnhancer {
	const pageWindow = typeof unsafeWindow === 'object' ? unsafeWindow : window;
	console.info('[Instagram Likes Media] active; waiting for Likes-page tiles.');
	document.documentElement.dataset.iglmActive = 'true';
	const enhancer = new LikesEnhancer({
		client: new InstagramClient(pageWindow.fetch.bind(pageWindow)),
		clipboard: {
			...(typeof GM_setClipboard === 'function' ? { managerWrite: GM_setClipboard } : {}),
			...(typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem === 'function'
				? {
					browserWriteRich: async (plain: string, html: string): Promise<void> => {
						await navigator.clipboard.write([new ClipboardItem({
							'text/html': new Blob([html], { type: 'text/html' }),
							'text/plain': new Blob([plain], { type: 'text/plain' }),
						})]);
					},
				}
				: {}),
			...(typeof document.execCommand === 'function'
				? {
					documentWriteRich: (
						plain: string,
						html: string,
					) => copyRichWithDocument(document, plain, html),
				}
				: {}),
			...(typeof navigator.clipboard?.writeText === 'function'
				? { browserWrite: navigator.clipboard.writeText.bind(navigator.clipboard) }
				: {}),
		},
		document,
		downloader: {
			...(typeof GM_download === 'function' ? { managerDownload: GM_download } : {}),
		},
		reportError: (message, error) => console.error('[Instagram Likes Media]', message, error),
	});
	enhancer.start();
	return enhancer;
}

if (location.pathname.startsWith('/your_activity/interactions/likes')) start();
