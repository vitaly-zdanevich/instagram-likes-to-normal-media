import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { JSDOM } from 'jsdom';

it('runs the minified userscript bundle on a mocked Likes page', async () => {
	const script = await readFile(new URL('../dist/instagram-likes-media.user.js', import.meta.url), 'utf8');
	assert.match(script, /^\/\/ ==UserScript==/);
	assert.match(script, /^\/\/ @license {6}MIT$/m);
	assert.match(script, /^\/\/ @description {2}Instagram Likes page: replace thumbnails to normal video HTML tag, add button to copy a post link\. Make compatible with Hover Zoom extension$/m);
	assert.match(script, /@grant\s+GM_setClipboard/);
	assert.match(script, /@grant\s+GM_download/);
	assert.ok(script.length < 12_000, `expected a minified bundle, received ${script.length} bytes`);
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
	const downloads: Array<[string, string]> = [];
	page.fetch = async (input) => {
		calls.push(String(input));
		if (String(input).includes('/info/')) {
			return Response.json({ items: [{
				caption: { text: 'Downloaded caption\nMore text' },
				code: 'VideoCode',
				id: '4096_123',
				product_type: 'clips',
				video_versions: [{ url: 'https://cdn.example/movie.mp4' }],
			}] });
		}
		return Response.json({ status: 'ok' });
	};
	Object.assign(page, {
		unsafeWindow: page,
		GM_download: (url: string, name: string) => downloads.push([url, name]),
		GM_setClipboard: () => undefined,
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
	page.document.querySelector<HTMLButtonElement>('.iglm-download')?.click();
	assert.deepEqual(downloads, [['https://cdn.example/movie.mp4', 'Downloaded caption.mp4']]);
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
