/** Download facility supplied by the userscript manager. */
export interface DownloadAccess {
	managerDownload?: (url: string, name: string) => void;
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

/** Starts a named download through the userscript manager. */
export function downloadVideo(url: string, filename: string, access: DownloadAccess): void {
	if (!access.managerDownload) throw new Error('The userscript download API is unavailable.');
	access.managerDownload(url, filename);
}
