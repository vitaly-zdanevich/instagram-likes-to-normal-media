import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { downloadVideo, videoFilename } from '../src/download.ts';

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
	it('uses the userscript manager download API', () => {
		const calls: Array<[string, string]> = [];
		downloadVideo('movie.mp4', 'Caption.mp4', {
			managerDownload: (url, name) => calls.push([url, name]),
		});
		assert.deepEqual(calls, [['movie.mp4', 'Caption.mp4']]);
	});

	it('reports an unavailable download API', () => {
		assert.throws(() => downloadVideo('movie.mp4', 'Caption.mp4', {}), /download API/i);
	});
});
