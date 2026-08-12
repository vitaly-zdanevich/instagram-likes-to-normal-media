import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { copyAttribution, copyPermalink, copyRichWithDocument } from '../src/clipboard.ts';

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

describe('copyAttribution', () => {
	it('closes Firefox clipboard metadata before Telegram Desktop parses linked HTML', async () => {
		const writes: Array<[string, string]> = [];
		await copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {
			browserWriteRich: async (plain, html) => { writes.push([plain, html]); },
			managerWrite: () => assert.fail('manager clipboard should not discard the plain-text flavor'),
		});

		assert.deepEqual(writes, [[
			'By artist.name, source',
			'</meta><html><body>By <a href="https://www.instagram.com/artist.name/">artist.name</a>, '
				+ '<a href="https://www.instagram.com/p/BAA/">source</a></body></html>',
		]]);
	});

	it('escapes account names and URLs in copied HTML', async () => {
		let copied = '';
		await copyAttribution({
			authorName: 'A&B <account>',
			authorUrl: 'https://example.com/?a=1&b=2',
			postUrl: 'https://example.com/post?x="quoted"',
		}, {
			browserWriteRich: async (_plain, html) => { copied = html; },
		});

		assert.equal(copied,
			'</meta><html><body>By <a href="https://example.com/?a=1&amp;b=2">A&amp;B &lt;account&gt;</a>, '
			+ '<a href="https://example.com/post?x=&quot;quoted&quot;">source</a></body></html>');
	});

	it('falls back to plain text through the userscript manager', async () => {
		const writes: Array<[string, string | undefined]> = [];
		await copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {
			managerWrite: (text, type) => writes.push([text, type]),
		});

		assert.deepEqual(writes, [[
			'By artist.name (https://www.instagram.com/artist.name/), source: https://www.instagram.com/p/BAA/',
			'text/plain',
		]]);
	});

	it('uses the plain-text manager fallback when rich browser copying fails', async () => {
		const writes: Array<[string, string | undefined]> = [];
		await copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {
			browserWriteRich: async () => { throw new Error('Rich clipboard denied'); },
			managerWrite: (text, type) => writes.push([text, type]),
		});

		assert.deepEqual(writes, [[
			'By artist.name (https://www.instagram.com/artist.name/), source: https://www.instagram.com/p/BAA/',
			'text/plain',
		]]);
	});

	it('uses the synchronous copy-event rich fallback before plain text', async () => {
		const writes: Array<[string, string]> = [];
		await copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {
			browserWriteRich: async () => assert.fail('async copying must not consume user activation first'),
			documentWriteRich: (plain: string, html: string) => {
				writes.push([plain, html]);
			},
			managerWrite: () => assert.fail('plain text should be the final fallback'),
		});

		assert.deepEqual(writes, [[
			'By artist.name, source',
			'</meta><html><body>By <a href="https://www.instagram.com/artist.name/">artist.name</a>, '
				+ '<a href="https://www.instagram.com/p/BAA/">source</a></body></html>',
		]]);
	});

	it('runs the synchronous rich writer before returning its promise', async () => {
		const calls: string[] = [];
		const result = copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {
			browserWriteRich: async () => { calls.push('async browser'); },
			documentWriteRich: () => { calls.push('synchronous copy event'); },
		});

		assert.deepEqual(calls, ['synchronous copy event']);
		await result;
	});

	it('falls back to plain text when rich clipboard data is unavailable', async () => {
		let copied = '';
		await copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {
			browserWrite: async (text) => { copied = text; },
		});

		assert.equal(copied,
			'By artist.name (https://www.instagram.com/artist.name/), source: https://www.instagram.com/p/BAA/');
	});

	it('fails clearly when clipboard access is unavailable', async () => {
		await assert.rejects(() => copyAttribution({
			authorName: 'artist.name',
			authorUrl: 'https://www.instagram.com/artist.name/',
			postUrl: 'https://www.instagram.com/p/BAA/',
		}, {}), /No clipboard API/);
	});
});

describe('copyRichWithDocument', () => {
	it('publishes matching HTML and plain text through one copy event', () => {
		let listener: EventListener | undefined;
		const writes: Array<[string, string]> = [];
		const fakeDocument = {
			addEventListener: (_type: string, callback: EventListener) => { listener = callback; },
			execCommand: (command: string) => {
				assert.equal(command, 'copy');
				listener?.({
					clipboardData: { setData: (type: string, data: string) => writes.push([type, data]) },
					preventDefault: () => undefined,
					stopImmediatePropagation: () => undefined,
				} as unknown as ClipboardEvent);
				return true;
			},
			removeEventListener: () => { listener = undefined; },
		} as unknown as Document;

		copyRichWithDocument(fakeDocument, 'By artist, source',
			'</meta><html><body>By <a href="https://www.instagram.com/artist/">artist</a>, '
			+ '<a href="https://www.instagram.com/p/BAA/">source</a></body></html>');

		assert.deepEqual(writes, [
			['text/html', '</meta><html><body>By <a href="https://www.instagram.com/artist/">artist</a>, '
				+ '<a href="https://www.instagram.com/p/BAA/">source</a></body></html>'],
			['text/plain', 'By artist, source'],
		]);
		assert.equal(listener, undefined);
	});
});
