import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { downloadVideo, videoFilename } from '../src/download.ts';
import type { DownloadOptions } from '../src/download.ts';

describe('videoFilename', () => {
	it('uses and sanitizes only the first caption line', () => {
		assert.equal(
			videoFilename('  A reel: one/two?  \nThe second line', 'ShortCode', 'https://cdn.example/video.mp4?x=1'),
			'A reel- one-two-.mp4',
		);
	});

	it('falls back to the shortcode and detects supported video extensions', () => {
		assert.equal(videoFilename('', 'ShortCode', 'https://cdn.example/video.webm'), 'ShortCode.webm');
		assert.equal(videoFilename(undefined, '', 'not a URL'), 'instagram-video.mp4');
	});

	it('bounds long names and avoids reserved Windows filenames', () => {
		assert.equal(videoFilename('CON', 'Code', 'video.mp4'), '_CON.mp4');
		assert.ok(videoFilename('x'.repeat(300), 'Code', 'video.mp4').length <= 124);
	});
});

describe('downloadVideo', () => {
	it('waits for the manager callback instead of reporting an immediate success', async () => {
		let options: DownloadOptions | undefined;
		let finished = false;
		const pending = downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (request) => { options = request; },
		});
		assert.ok(pending instanceof Promise, 'download completion must be asynchronous');
		void pending.then(() => { finished = true; });
		await Promise.resolve();
		assert.equal(finished, false);
		assert.ok(options);
		assert.equal(options.url, 'movie.mp4');
		assert.equal(options.name, 'Caption.mp4');
		options.onload({ status: 200 });
		await pending;
		assert.equal(finished, true);
	});

	it('rejects failed HTTP responses even when the manager calls onload', async () => {
		for (const status of [0, 302, 403, 404, 500]) {
			await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
				managerDownload: (options) => options.onload({ status }),
			}), new RegExp(`HTTP ${status}`));
		}
	});

	it('accepts browser-download completion callbacks without HTTP response data', async () => {
		await downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (options) => options.onload(),
		});
	});

	it('preserves asynchronous manager error details', async () => {
		for (const error of [new Error('Network failed'), { message: 'Network failed' }, 'Network failed']) {
			await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
				managerDownload: (options) => queueMicrotask(() => options.onerror(error)),
			}), /Network failed/);
		}
		await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (options) => options.onerror({
				error: 'not_succeeded', details: { current: 'SERVER_FORBIDDEN' },
			}),
		}), /not_succeeded.*SERVER_FORBIDDEN/);
	});

	it('reports timeouts, cancellation, and failures without details', async () => {
		await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (options) => {
				assert.ok(options.timeout > 0);
				options.ontimeout();
			},
		}), /timed out/i);
		await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (options) => options.onabort(),
		}), /cancelled/i);
		await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (options) => options.onerror(undefined),
		}), /download failed/i);
	});

	it('reports synchronous manager exceptions and unavailable APIs', async () => {
		await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: () => { throw new Error('Permission denied'); },
		}), /Permission denied/);
		await assert.rejects(downloadVideo('movie.mp4', 'Caption.mp4', {}), /download API/i);
	});
});
