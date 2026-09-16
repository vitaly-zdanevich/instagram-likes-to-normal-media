/** Callback options supported by Violentmonkey and Tampermonkey's GM_download. */
export interface DownloadOptions {
	url: string;
	name: string;
	timeout: number;
	onload: (response?: unknown) => void;
	onerror: (error: unknown) => void;
	ontimeout: () => void;
	onabort: () => void;
}

/** Download facility supplied by the userscript manager. */
export interface DownloadAccess {
	managerDownload?: (options: DownloadOptions) => void;
}

const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'webm']);
const WINDOWS_RESERVED_NAME = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/i;

function videoExtension(sourceUrl: string): string {
	try {
		const pathname = new URL(sourceUrl, 'https://www.instagram.com/').pathname;
		const extension = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
		if (extension && VIDEO_EXTENSIONS.has(extension)) return extension;
	} catch {
		// A malformed source still receives the format Instagram normally serves.
	}
	return 'mp4';
}

function safeFilenameBase(value: string): string {
	const cleaned = value
		.normalize('NFKC')
		.replace(/[\p{Cc}<>:"/\\|?*]+/gu, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/g, '')
		.slice(0, 120);
	return WINDOWS_RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Builds a portable video filename from the caption's first line. */
export function videoFilename(description: string | undefined, shortcode: string, sourceUrl: string): string {
	const firstLine = description?.split(/\r?\n/, 1)[0] ?? '';
	const base = safeFilenameBase(firstLine) || safeFilenameBase(shortcode) || 'instagram-video';
	return `${base}.${videoExtension(sourceUrl)}`;
}

/** Extracts error details from both managers, including errors from another realm. */
function downloadError(error: unknown): Error {
	if (typeof error === 'string' && error) return new Error(error);
	if (error && typeof error === 'object') {
		const failure = error as Record<string, unknown>;
		if (typeof failure.message === 'string' && failure.message) return new Error(failure.message);
		if (typeof failure.error === 'string' && failure.error) {
			const details = failure.details;
			const detail = typeof details === 'string' ? details
				: details && typeof details === 'object' && 'current' in details
					? details.current : undefined;
			return new Error(typeof detail === 'string'
				? `${failure.error}: ${detail}` : failure.error);
		}
		if (typeof failure.status === 'number') {
			return new Error(`Video download failed (HTTP ${failure.status}). Reload the Likes page and try again.`);
		}
	}
	return new Error('Video download failed. Check the userscript manager’s download permissions.');
}

/**
 * Waits for the manager's result instead of mistaking request submission for success.
 * Violentmonkey native mode acknowledges handing a blob to the browser, not saving
 * it to disk; browser download mode may call onload without an HTTP response.
 */
export function downloadVideo(url: string, filename: string, access: DownloadAccess): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!access.managerDownload) {
			reject(new Error('The userscript download API is unavailable.'));
			return;
		}
		access.managerDownload({
			url,
			name: filename,
			timeout: 300_000,
			onload: (response) => {
				// The native manager can call onload even for a CDN error response.
				if (response && typeof response === 'object'
					&& 'status' in response && typeof response.status === 'number'
					&& (response.status < 200 || response.status >= 300)) {
					reject(downloadError(response));
				} else {
					resolve();
				}
			},
			onerror: (error) => reject(downloadError(error)),
			ontimeout: () => reject(new Error('Video download timed out. Try again.')),
			onabort: () => reject(new Error('Video download was cancelled.')),
		});
	});
}
