/** Clipboard facilities supplied by the userscript manager and browser. */
export interface ClipboardAccess {
	browserWrite?: (text: string) => Promise<void>;
	managerWrite?: (text: string, type?: string) => void;
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
