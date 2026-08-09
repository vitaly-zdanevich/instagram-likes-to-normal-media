import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { identityFromThumbnail, instagramError, mediaIdToShortcode, parseMediaResponse } from '../src/media.ts';

describe('media identifiers', () => {
	it('converts numeric IDs to Instagram shortcodes', () => {
		assert.equal(mediaIdToShortcode('0'), 'A');
		assert.equal(mediaIdToShortcode('1'), 'B');
		assert.equal(mediaIdToShortcode('63'), '_');
		assert.equal(mediaIdToShortcode('64'), 'BA');
		assert.equal(mediaIdToShortcode('4096'), 'BAA');
	});

	it('extracts an identity from a thumbnail cache key', () => {
		const encoded = Buffer.from('4096.123').toString('base64url');
		assert.deepEqual(
			identityFromThumbnail(`https://cdn.example/image.jpg?x=1&ig_cache_key=${encoded}.2`),
			{
				mediaId: '4096',
				shortcode: 'BAA',
				permalink: 'https://www.instagram.com/p/BAA/',
			},
		);
	});

	it('extracts a real cache key from the current Likes page', () => {
		const identity = identityFromThumbnail(
			'https://instagram.example/thumb.jpg?ig_cache_key=MzkwMDIzODgwMjcwOTA1Mzk3MA%3D%3D.3-ccb7-5',
		);
		assert.equal(identity?.mediaId, '3900238802709053970');
		assert.equal(identity?.permalink, 'https://www.instagram.com/p/DYgbobWqwIS/');
	});

	it('removes the owner ID appended to a carousel media ID', () => {
		const compositeId = '394853888659234119718084614081268362';
		const encoded = Buffer.from(compositeId).toString('base64url');
		const identity = identityFromThumbnail(`https://instagram.example/thumb.jpg?ig_cache_key=${encoded}.3`);

		assert.equal(identity?.mediaId, '3948538886592341197');
	});

	it('rejects missing and malformed cache keys', () => {
		assert.equal(identityFromThumbnail('https://cdn.example/image.jpg'), undefined);
		assert.equal(identityFromThumbnail('not a URL'), undefined);
		assert.equal(identityFromThumbnail('https://cdn.example/?ig_cache_key=!!!'), undefined);
	});
});

describe('media response parsing', () => {
	const identity = {
		mediaId: '4096',
		shortcode: 'BAA',
		permalink: 'https://www.instagram.com/p/BAA/',
	};

	it('selects the largest video and poster and identifies reels', () => {
		const result = parseMediaResponse({
			items: [{
				caption: { text: 'First caption line\nSecond caption line' },
				code: 'ReelCode',
				id: '4096_123',
				product_type: 'clips',
				video_versions: [
					{ url: 'small.mp4', width: 320, height: 480 },
					{ url: 'large.mp4', width: 1080, height: 1920 },
				],
				image_versions2: { candidates: [
					{ url: 'small.jpg', width: 320, height: 480 },
					{ url: 'large.jpg', width: 1080, height: 1920 },
				] },
			}],
		}, identity);

		assert.equal(result.permalink, 'https://www.instagram.com/p/ReelCode/');
		assert.equal(result.mediaId, '4096_123');
		assert.equal(result.description, 'First caption line\nSecond caption line');
		assert.deepEqual(result.assets, [{
			kind: 'video',
			src: 'large.mp4',
			poster: 'large.jpg',
			width: 1080,
			height: 1920,
		}]);
	});

	it('preserves every image and video in a carousel', () => {
		const result = parseMediaResponse({
			items: [{ carousel_media: [
				{ image_versions2: { candidates: [{ url: 'photo.jpg', width: 10, height: 20 }] } },
				{
					video_versions: [{ url: 'movie.mp4', width: 30, height: 40 }],
					image_versions2: { candidates: [{ url: 'poster.jpg', width: 30, height: 40 }] },
				},
			] }],
		}, identity);

		assert.deepEqual(result.assets.map((asset) => [asset.kind, asset.src]), [
			['image', 'photo.jpg'],
			['video', 'movie.mp4'],
		]);
	});

	it('reports incomplete responses', () => {
		assert.throws(() => parseMediaResponse({}, identity), /no media/i);
		assert.throws(() => parseMediaResponse({ items: [{}] }, identity), /no playable media URL/i);
	});

	it('extracts an Instagram error message', () => {
		assert.equal(instagramError({ message: 'Try again later.' }, 'Fallback'), 'Try again later.');
		assert.equal(instagramError({}, 'Fallback'), 'Fallback');
	});
});
