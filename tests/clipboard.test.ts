import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { copyPermalink } from '../src/clipboard.ts';

describe('copyPermalink', () => {
	it('prefers the userscript manager clipboard', async () => {
		const writes: string[] = [];
		await copyPermalink('https://www.instagram.com/p/BAA/', {
			managerWrite: (text) => writes.push(text),
			browserWrite: async () => assert.fail('browser clipboard should not be called'),
		});
		assert.deepEqual(writes, ['https://www.instagram.com/p/BAA/']);
	});

	it('falls back to the browser clipboard', async () => {
		let copied = '';
		await copyPermalink('post-url', { browserWrite: async (text) => { copied = text; } });
		assert.equal(copied, 'post-url');
	});

	it('fails clearly when clipboard access is unavailable', async () => {
		await assert.rejects(() => copyPermalink('post-url', {}), /No clipboard API/);
	});
});
