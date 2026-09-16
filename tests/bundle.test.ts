import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { JSDOM } from 'jsdom';
import type { DownloadOptions } from '../src/download.ts';

it('runs the minified userscript bundle on a mocked Likes page', async () => {
	const script = await readFile(new URL('../dist/instagram-likes-media.user.js', import.meta.url), 'utf8');
	assert.match(script, /^\/\/ ==UserScript==/);
	assert.match(script, /^\/\/ @license {6}MIT$/m);
	assert.match(script, /^\/\/ @description {2}Instagram Likes page: replace thumbnails to normal video HTML tag, add button to copy a post link\. Make compatible with Hover Zoom extension$/m);
	assert.match(script, /@grant\s+GM_setClipboard/);
	assert.match(script, /@grant\s+GM_download/);
	assert.match(script, /@inject-into\s+page/);
	assert.ok(script.length < 15_000, `expected a minified bundle, received ${script.length} bytes`);
	assert.doesNotMatch(script, /\.iglm-tile\s*\{\s*\n/, 'embedded production CSS must be minified');

	const cacheKey = Buffer.from('4096.123').toString('base64url');
	const dom = new JSDOM(`<!doctype html><html><head></head><body>
		<div data-bloks-name="bk.components.Flexbox" role="button">
			<img data-bloks-name="bk.components.Image"
				src="https://cdn.example/thumb.jpg?ig_cache_key=${cacheKey}.2">
		</div>
	</body></html>`, {
		runScripts: 'outside-only',
		url: 'https://www.instagram.com/your_activity/interactions/likes/',
	});
	const page = dom.window as unknown as Window & typeof globalThis;
	const calls: string[] = [];
	const clipboards: Array<[string, string | undefined]> = [];
	const downloads: Array<[string, string]> = [];
	let pendingDownload: DownloadOptions | undefined;
	page.fetch = async (input) => {
		calls.push(String(input));
		if (String(input).includes('/info/')) {
			return Response.json({ items: [{
				caption: { text: 'Downloaded caption\nMore text' },
				code: 'VideoCode',
				id: '4096_123',
				product_type: 'clips',
				user: { username: 'artist.name' },
				video_versions: [{ url: 'https://cdn.example/movie.mp4' }],
			}] });
		}
		return Response.json({ status: 'ok' });
	};
	Object.assign(page, {
		unsafeWindow: page,
		GM_download: (options: DownloadOptions) => {
			downloads.push([options.url, options.name]);
			pendingDownload = options;
		},
		GM_setClipboard: (text: string, type?: string) => clipboards.push([text, type]),
	});
	page.document.cookie = 'csrftoken=test-token';
	page.document.cookie = 'ds_user_id=789';

	page.eval(script);
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.equal(page.document.querySelector<HTMLAnchorElement>('.iglm-actions a')?.href,
		'https://www.instagram.com/p/VideoCode/');
	assert.equal(page.document.querySelector<HTMLIFrameElement>('.iglm-media-frame')
		?.contentDocument?.querySelector<HTMLVideoElement>('video')?.src,
	'https://cdn.example/movie.mp4');

	assert.equal(page.document.querySelector('.iglm-like'), null);
	page.document.querySelector<HTMLButtonElement>('.iglm-attribution')?.click();
	assert.deepEqual(clipboards, [[
		'By artist.name (https://www.instagram.com/artist.name/), '
			+ 'source: https://www.instagram.com/p/VideoCode/',
		'text/plain',
	]]);
	const download = page.document.querySelector<HTMLButtonElement>('.iglm-download');
	assert.ok(download);
	download.click();
	assert.equal(download.textContent, '⏳');
	assert.equal(download.disabled, true);
	assert.deepEqual(downloads, [['https://cdn.example/movie.mp4', 'Downloaded caption.mp4']]);
	assert.ok(pendingDownload);
	pendingDownload.onload({ status: 200 });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(download.textContent, '✅');
	assert.equal(download.disabled, false);
	assert.deepEqual(calls, [
		'https://i.instagram.com/api/v1/media/4096/info/',
	]);
});

it('builds a readable userscript for Greasy Fork', async () => {
	const script = await readFile(
		new URL('../greasyfork/instagram-likes-media.user.js', import.meta.url),
		'utf8',
	);
	assert.match(script, /^\/\/ ==UserScript==/);
	assert.match(script, /const enhancer = new LikesEnhancer\(/);
	assert.match(script, /\.iglm-tile \{\n/);
});
