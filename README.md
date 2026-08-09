# Instagram Likes Media

A small TypeScript userscript for Instagram’s **Your activity → Likes** page. It keeps Instagram’s page in place and adds:

- native, playable `<video controls>` elements for videos and Reels;
- native `<img>` elements for carousel images;
- an ordinary **Post** link on every tile;
- a `📋` button beside each link to copy it;
- a `⬇️` button that downloads a video using the post caption’s first line as its filename.

No API key, Instagram password, backend, PWA, or like-changing automation is involved. The script uses the browser session that is already signed in to Instagram.

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Run `npm install` and `npm run build`.
3. Open `dist/instagram-likes-media.user.js` in the browser, or paste its contents into a new userscript.
4. Open [Instagram’s Likes activity page](https://www.instagram.com/your_activity/interactions/likes/).

The production file is a single minified userscript. Rebuild it after changing anything under `src/`.

## Development

```sh
npm run dev           # rebuild when source files change
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
```

Tests use mock Instagram data and jsdom; they do not access an Instagram account.

## Greasy Fork publishing

`npm run build` writes a readable, unminified bundle to `greasyfork/instagram-likes-media.user.js`. This file is tracked because Greasy Fork synchronizes from a raw repository URL; CI rejects a commit when the bundle is stale.

After the first GitHub push:

1. Import the script into Greasy Fork from `https://raw.githubusercontent.com/vitaly-zdanevich/instagram-likes-to-normal-media/main/greasyfork/instagram-likes-media.user.js`.
2. Open [Greasy Fork’s webhook setup](https://greasyfork.org/en/users/webhook-info) and generate its secret.
3. In the GitHub repository, open **Settings → Webhooks → Add webhook**.
4. Use Greasy Fork’s payload URL and secret, choose `application/json`, select **Just the push event**, and leave the webhook active.

Greasy Fork will then check the tracked bundle after each repository push. The webhook secret belongs in GitHub’s webhook settings, not in this repository or GitHub Actions.

## Compatibility and limitations

The generated script targets current Firefox and Chromium browsers on Linux. It relies on Instagram’s undocumented authenticated web routes and the Likes-page `ig_cache_key`; Instagram can change either without notice. A warning icon on a tile contains the media-loading error in its tooltip.

Media URLs are Instagram CDN URLs and can expire. The script does not auto-scroll or pre-load likes that Instagram has not rendered yet.

## Related documentation

- [Violentmonkey metadata block](https://violentmonkey.github.io/api/metadata-block/)
- [Violentmonkey privileged APIs](https://violentmonkey.github.io/api/gm/)
- [Tampermonkey documentation](https://www.tampermonkey.net/documentation.php)
- [Greasy Fork API and webhook notifications](https://greasyfork.org/en/help/api)
- [Greasy Fork code rules](https://greasyfork.org/en/help/code-rules)
- [esbuild API](https://esbuild.github.io/api/)
- [Node.js test runner](https://nodejs.org/api/test.html)
