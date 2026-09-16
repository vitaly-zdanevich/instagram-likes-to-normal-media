import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import type { DownloadOptions } from '../src/download.ts';
import type { MediaClient, PostIdentity, PostMedia } from '../src/types.ts';
import { LikesEnhancer } from '../src/ui.ts';

function thumbnail(mediaId = '4096'): string {
	const key = Buffer.from(`${mediaId}.123`).toString('base64url');
	return `https://cdn.example/thumb.jpg?ig_cache_key=${key}.2`;
}

function createPage(): JSDOM {
	return new JSDOM(`<!doctype html><html><head></head><body>
		<div id="collection">
			<div data-bloks-name="bk.components.Flexbox" role="button">
				<img data-bloks-name="bk.components.Image" src="${thumbnail()}" alt="A liked post">
			</div>
		</div>
	</body></html>`, { url: 'https://www.instagram.com/your_activity/interactions/likes/' });
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LikesEnhancer', () => {
	it('waits for download completion before showing success and prevents duplicate requests', async () => {
		const dom = createPage();
		const requests: DownloadOptions[] = [];
		const enhancer = new LikesEnhancer({
			client: { getMedia: async (identity) => ({
				...imageMedia(identity),
				assets: [{ kind: 'video', src: 'https://cdn.example/movie.mp4' }],
				description: 'A caption',
			}) },
			clipboard: {},
			downloader: { managerDownload: (options) => { requests.push(options); } },
			document: dom.window.document,
		});
		enhancer.start();
		await settle();
		const button = dom.window.document.querySelector<HTMLButtonElement>('.iglm-download');
		assert.ok(button);

		button.click();
		await settle();
		assert.equal(button.textContent, '⏳');
		assert.equal(button.disabled, true);
		assert.equal(button.title, 'Downloading A caption.mp4');
		button.click();
		button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		assert.equal(requests.length, 1, 'repeated clicks must not start concurrent downloads');

		requests[0]?.onload();
		await settle();
		assert.equal(button.textContent, '✅');
		assert.equal(button.title, 'Download handed to browser: A caption.mp4');
		assert.equal(button.disabled, false);
		enhancer.stop();
	});

	it('reports an asynchronous download failure and allows retrying it', async () => {
		const dom = createPage();
		const requests: DownloadOptions[] = [];
		const reports: Array<[string, unknown]> = [];
		const enhancer = new LikesEnhancer({
			client: { getMedia: async (identity) => ({
				...imageMedia(identity),
				assets: [{ kind: 'video', src: 'https://cdn.example/movie.mp4' }],
			}) },
			clipboard: {},
			downloader: { managerDownload: (options) => { requests.push(options); } },
			document: dom.window.document,
			reportError: (message, error) => { reports.push([message, error]); },
		});
		enhancer.start();
		await settle();
		const button = dom.window.document.querySelector<HTMLButtonElement>('.iglm-download');
		assert.ok(button);

		button.click();
		const failure = new Error('Download failed: HTTP 403');
		requests[0]?.onerror(failure);
		await settle();
		assert.equal(button.textContent, '⚠️');
		assert.equal(button.title, failure.message);
		assert.equal(button.disabled, false);
		assert.equal(reports.length, 1);
		assert.match(reports[0]![0], /Could not download video/);
		assert.equal((reports[0]![1] as Error).message, failure.message);

		button.click();
		assert.equal(requests.length, 2);
		assert.equal(button.textContent, '⏳');
		requests[1]?.onload();
		await settle();
		assert.equal(button.textContent, '✅');
		assert.equal(button.disabled, false);
		enhancer.stop();
	});

	it('adds native video, permalink, copy buttons, and download without a mutation control', async () => {
		const dom = createPage();
		const copied: Array<[string, string | undefined]> = [];
		const richCopies: Array<[string, string]> = [];
		const downloaded: Array<[string, string]> = [];
		const client: MediaClient = {
			getMedia: async (identity) => ({
				assets: [{ kind: 'video', src: 'https://cdn.example/movie.mp4', poster: 'poster.jpg' }],
				author: {
					name: 'artist.name',
					profileUrl: 'https://www.instagram.com/artist.name/',
				},
				description: 'First caption line\nSecond caption line',
				mediaId: `${identity.mediaId}_123`,
				permalink: 'https://www.instagram.com/reel/VideoCode/',
				shortcode: 'VideoCode',
			}),
		};
		const enhancer = new LikesEnhancer({
			client,
			clipboard: {
				browserWriteRich: async (plain, html) => { richCopies.push([plain, html]); },
				managerWrite: (text, type) => copied.push([text, type]),
			},
			downloader: { managerDownload: (options) => {
				downloaded.push([options.url, options.name]);
				options.onload();
			} },
			document: dom.window.document,
		});

		enhancer.start();
		await settle();

		const link = dom.window.document.querySelector<HTMLAnchorElement>('.iglm-actions a');
		const video = dom.window.document.querySelector<HTMLIFrameElement>('.iglm-media-frame')
			?.contentDocument?.querySelector<HTMLVideoElement>('video');
		const copy = dom.window.document.querySelector<HTMLButtonElement>('.iglm-copy');
		const attribution = dom.window.document.querySelector<HTMLButtonElement>('.iglm-attribution');
		const download = dom.window.document.querySelector<HTMLButtonElement>('.iglm-download');
		assert.equal(link?.href, 'https://www.instagram.com/reel/VideoCode/');
		assert.equal(video?.src, 'https://cdn.example/movie.mp4');
		assert.equal(video?.controls, true);
		assert.equal(video?.playsInline, true);

		copy?.click();
		await settle();
		assert.deepEqual(copied, [['https://www.instagram.com/reel/VideoCode/', 'text']]);
		assert.equal(copy?.textContent, '✅');

		attribution?.click();
		await settle();
		assert.deepEqual(richCopies, [[
			'By artist.name, source',
			'</meta><html><body>By <a href="https://www.instagram.com/artist.name/">artist.name</a>, '
				+ '<a href="https://www.instagram.com/reel/VideoCode/">source</a></body></html>',
		]]);
		assert.equal(attribution?.textContent, '✅');

		download?.click();
		assert.deepEqual(downloaded, [['https://cdn.example/movie.mp4', 'First caption line.mp4']]);

		assert.equal(dom.window.document.querySelector('.iglm-like'), null);
		assert.equal(dom.window.document.querySelectorAll('[role="button"]').length, 1);
		enhancer.stop();
	});

	it('renders all carousel assets and navigation buttons', async () => {
		const dom = createPage();
		const client: MediaClient = {
			getMedia: async (identity) => ({
				assets: [
					{ kind: 'image', src: 'photo.jpg' },
					{ kind: 'video', src: 'movie.mp4' },
				],
				mediaId: identity.mediaId,
				permalink: identity.permalink,
				shortcode: identity.shortcode,
			}),
		};
		const enhancer = new LikesEnhancer({ client, clipboard: {}, document: dom.window.document });
		enhancer.start();
		await settle();

		assert.equal(dom.window.document.querySelectorAll('.iglm-track > img').length, 1);
		const frames = dom.window.document.querySelectorAll<HTMLIFrameElement>('.iglm-track > .iglm-media-frame');
		assert.equal(frames.length, 1);
		assert.equal(frames[0]?.contentDocument?.querySelectorAll('video').length, 1);
		assert.equal(dom.window.document.querySelectorAll('.iglm-carousel-button').length, 2);
		enhancer.stop();
	});

	it('isolates native media pointer events from the clickable tile', async () => {
		const dom = createPage();
		const client: MediaClient = {
			getMedia: async (identity) => ({
				assets: [{ kind: 'video', src: 'movie.mp4' }],
				mediaId: identity.mediaId,
				permalink: identity.permalink,
				shortcode: identity.shortcode,
			}),
		};
		const enhancer = new LikesEnhancer({ client, clipboard: {}, document: dom.window.document });
		let instagramNavigations = 0;
		dom.window.document.querySelector('#collection')?.addEventListener('click', () => {
			instagramNavigations += 1;
		}, { capture: true });
		enhancer.start();
		await settle();

		const tile = dom.window.document.querySelector<HTMLElement>('.iglm-tile');
		const stage = tile?.querySelector<HTMLElement>('.iglm-stage');
		const frame = dom.window.document.querySelector<HTMLIFrameElement>('.iglm-media-frame');
		const video = frame?.contentDocument?.querySelector<HTMLVideoElement>('video');
		assert.ok(video, 'video should be isolated from Instagram’s clickable tile document');
		assert.equal(dom.window.getComputedStyle(tile!).pointerEvents, 'none',
			'Instagram’s clickable tile must not receive native media input');
		assert.equal(dom.window.getComputedStyle(stage!).pointerEvents, 'auto',
			'the native media stage must remain interactive');
		assert.equal(dom.window.getComputedStyle(frame!).pointerEvents, 'auto',
			'the isolated video must remain interactive');
		let tilePointerUps = 0;
		tile?.addEventListener('pointerup', () => { tilePointerUps += 1; });
		video?.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true, cancelable: true }));
		assert.equal(tilePointerUps, 0, 'media pointerup should not reach Instagram’s tile handler');

		const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
		video?.dispatchEvent(click);
		assert.equal(instagramNavigations, 0, 'media click should not enter Instagram’s capture-phase event path');
		enhancer.stop();
	});

	it('reports a media-loading failure as well as showing its warning', async () => {
		const dom = createPage();
		const reports: Array<[string, unknown]> = [];
		const failure = new Error('Media endpoint failed');
		const client: MediaClient = {
			getMedia: async () => { throw failure; },
		};
		const enhancer = new LikesEnhancer({
			client,
			clipboard: {},
			document: dom.window.document,
			reportError: (message, error) => reports.push([message, error]),
		});
		enhancer.start();
		await settle();

		assert.equal(dom.window.document.querySelector<HTMLElement>('.iglm-warning')?.title, 'Media endpoint failed');
		assert.deepEqual(reports, [['Could not load media 4096.', failure]]);
		enhancer.stop();
	});

	it('enhances tiles added by Instagram after startup', async () => {
		const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
		const client: MediaClient = {
			getMedia: async (identity) => imageMedia(identity),
		};
		const enhancer = new LikesEnhancer({ client, clipboard: {}, document: dom.window.document });
		enhancer.start();
		dom.window.document.body.insertAdjacentHTML('beforeend', `
			<div data-bloks-name="bk.components.Flexbox" role="button">
				<img data-bloks-name="bk.components.Image" src="${thumbnail()}">
			</div>`);
		await settle();
		assert.ok(dom.window.document.querySelector('.iglm-actions'));
		enhancer.stop();
	});

	it('recognizes a current tile without the old Bloks container attribute', async () => {
		const dom = new JSDOM(`<!doctype html><html><head></head><body>
			<div role="button"><img src="${thumbnail()}"></div>
		</body></html>`);
		const client: MediaClient = {
			getMedia: async (identity) => imageMedia(identity),
		};
		const enhancer = new LikesEnhancer({ client, clipboard: {}, document: dom.window.document });
		enhancer.start();
		await settle();
		assert.ok(dom.window.document.querySelector('.iglm-actions'));
		enhancer.stop();
	});

	it('recognizes an image whose src is assigned after insertion', async () => {
		const dom = new JSDOM('<!doctype html><html><head></head><body><div role="button"><img></div></body></html>');
		const client: MediaClient = {
			getMedia: async (identity) => imageMedia(identity),
		};
		const enhancer = new LikesEnhancer({ client, clipboard: {}, document: dom.window.document });
		enhancer.start();
		const image = dom.window.document.querySelector('img');
		if (image) image.src = thumbnail();
		await settle();
		assert.ok(dom.window.document.querySelector('.iglm-actions'));
		enhancer.stop();
	});
});

function imageMedia(identity: PostIdentity): PostMedia {
	return {
		assets: [{ kind: 'image', src: 'photo.jpg' }],
		mediaId: identity.mediaId,
		permalink: identity.permalink,
		shortcode: identity.shortcode,
	};
}
