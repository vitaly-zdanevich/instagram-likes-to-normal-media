/** Clipboard facilities supplied by the userscript manager and browser. */
export interface ClipboardAccess {
	browserWrite?: (text: string) => Promise<void>;
	browserWriteRich?: (plain: string, html: string) => Promise<void>;
	documentWriteRich?: (plain: string, html: string) => void;
	managerWrite?: (text: string, type?: string) => void;
}

/** Account and post links used to credit an Instagram post. */
export interface PostAttribution {
	authorName: string;
	authorUrl: string;
	postUrl: string;
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Publishes matching HTML and plain text through a user-initiated copy event. */
export function copyRichWithDocument(
	document: Document,
	plain: string,
	html: string,
): void {
	let copied = false;
	const handleCopy = (event: ClipboardEvent): void => {
		if (!event.clipboardData) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		event.clipboardData.setData('text/html', html);
		event.clipboardData.setData('text/plain', plain);
		copied = true;
	};

	document.addEventListener('copy', handleCopy, { capture: true });
	let commandSucceeded = false;
	try {
		commandSucceeded = document.execCommand('copy');
	} finally {
		document.removeEventListener('copy', handleCopy, { capture: true });
	}
	if (!commandSucceeded || !copied) throw new Error('Firefox did not copy rich attribution.');
}

/** Copies a permalink, preferring the userscript manager's reliable API. */
export async function copyPermalink(url: string, access: ClipboardAccess): Promise<void> {
	if (access.managerWrite) {
		access.managerWrite(url, 'text');
		return;
	}
	if (access.browserWrite) {
		await access.browserWrite(url);
		return;
	}
	throw new Error('No clipboard API is available.');
}

/** Copies attribution with linked author and source labels for rich-text apps. */
export async function copyAttribution(attribution: PostAttribution, access: ClipboardAccess): Promise<void> {
	const authorName = escapeHtml(attribution.authorName);
	const authorUrl = escapeHtml(attribution.authorUrl);
	const postUrl = escapeHtml(attribution.postUrl);
	// Firefox prepends an unclosed <meta> to clipboard HTML. Telegram Desktop
	// treats it as a hidden container, so close it before the linked content.
	const html = '</meta><html><body>'
		+ `By <a href="${authorUrl}">${authorName}</a>, <a href="${postUrl}">source</a>`
		+ '</body></html>';
	const richPlain = `By ${attribution.authorName}, source`;
	const fallbackPlain
		= `By ${attribution.authorName} (${attribution.authorUrl}), source: ${attribution.postUrl}`;

	let richWriteError: unknown;
	if (access.documentWriteRich) {
		try {
			access.documentWriteRich(richPlain, html);
			return;
		} catch (error: unknown) {
			richWriteError = error;
		}
	}
	if (access.browserWriteRich) {
		try {
			await access.browserWriteRich(richPlain, html);
			return;
		} catch (error: unknown) {
			richWriteError = error;
		}
	}
	if (access.managerWrite) {
		access.managerWrite(fallbackPlain, 'text/plain');
		return;
	}
	if (access.browserWrite) {
		await access.browserWrite(fallbackPlain);
		return;
	}
	if (richWriteError) throw richWriteError;
	throw new Error('No clipboard API is available.');
}
