import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InstagramClient } from '../src/instagram.ts';

const identity = {
	mediaId: '4096',
	shortcode: 'BAA',
	permalink: 'https://www.instagram.com/p/BAA/',
};

describe('InstagramClient', () => {
	it('loads media with authenticated Instagram headers', async () => {
		let input: RequestInfo | URL | undefined;
		let init: RequestInit | undefined;
		const fetcher: typeof fetch = async (request, requestInit) => {
			input = request;
			init = requestInit;
			return Response.json({ items: [{ image_versions2: { candidates: [{ url: 'photo.jpg' }] } }] });
		};
		const client = new InstagramClient(fetcher);

		const media = await client.getMedia(identity);
		assert.equal(input, 'https://i.instagram.com/api/v1/media/4096/info/');
		assert.equal(init?.mode, 'cors');
		assert.equal(init?.credentials, 'include');
		assert.equal(new Headers(init?.headers).get('X-IG-App-ID'), '936619743392459');
		assert.equal(media.assets[0]?.src, 'photo.jpg');
	});

	it('surfaces Instagram API failures', async () => {
		const client = new InstagramClient(
			async () => Response.json({ message: 'Please wait.' }, { status: 429 }),
		);
		await assert.rejects(() => client.getMedia(identity), /Please wait/);
	});
});
