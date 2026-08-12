import { context, transform } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const watching = process.argv.includes('--watch');

/** Creates an esbuild plugin that optionally minifies the inline CSS template. */
function createInlineCssPlugin(minify) {
	return {
		name: 'transform-inline-css',
		setup(build) {
			build.onLoad({ filter: /\/src\/styles\.ts$/ }, async ({ path }) => {
				const source = await readFile(path, 'utf8');
				if (!minify) return { contents: source, loader: 'ts' };

				const declaration = /export const STYLES = `([\s\S]*?)`;/;
				const match = source.match(declaration);
				if (!match?.[1]) throw new Error('Could not find the inline CSS in src/styles.ts.');
				const result = await transform(match[1], { loader: 'css', minify: true });
				return {
					contents: source.replace(declaration, `export const STYLES = ${JSON.stringify(result.code.trim())};`),
					loader: 'ts',
				};
			});
		},
	};
}

const metadata = `// ==UserScript==
// @name         Instagram Likes Media
// @namespace    https://github.com/vitaly-zdanevich/instagram-likes-media
// @version      ${pkg.version}
// @license      MIT
// @description  Instagram Likes page: replace thumbnails to normal video HTML tag, add button to copy a post link. Make compatible with Hover Zoom extension
// @match        https://www.instagram.com/your_activity/interactions/likes*
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        unsafeWindow
// @inject-into  page
// @run-at       document-idle
// @noframes
// ==/UserScript==`;

const distUrl = new URL('../dist/instagram-likes-media.user.js', import.meta.url);
const greasyForkUrl = new URL('../greasyfork/instagram-likes-media.user.js', import.meta.url);

await Promise.all([
	mkdir(new URL('../dist/', import.meta.url), { recursive: true }),
	mkdir(new URL('../greasyfork/', import.meta.url), { recursive: true }),
]);

/** Returns the shared esbuild options for one userscript bundle. */
function buildOptions(outfile, minify) {
	return {
		entryPoints: [new URL('../src/main.ts', import.meta.url).pathname],
		bundle: true,
		format: 'iife',
		legalComments: 'none',
		minify,
		outfile: outfile.pathname,
		platform: 'browser',
		plugins: [createInlineCssPlugin(minify)],
		target: ['chrome109', 'firefox115'],
		banner: { js: metadata },
	};
}

if (watching) {
	const buildContext = await context(buildOptions(distUrl, false));
	await buildContext.watch();
	console.log('Watching src/ and rebuilding dist/instagram-likes-media.user.js');
} else {
	const buildContexts = await Promise.all([
		context(buildOptions(distUrl, true)),
		context(buildOptions(greasyForkUrl, false)),
	]);
	try {
		await Promise.all(buildContexts.map((buildContext) => buildContext.rebuild()));
	} finally {
		await Promise.all(buildContexts.map((buildContext) => buildContext.dispose()));
	}
}
