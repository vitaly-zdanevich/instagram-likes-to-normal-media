import { instagramError, parseMediaResponse } from './media.ts';
import type { MediaClient, PostIdentity, PostMedia } from './types.ts';

const INSTAGRAM_WEB_APP_ID = '936619743392459';
const INSTAGRAM_MEDIA_INFO_ORIGIN = 'https://i.instagram.com';

/**
 * Calls the same private web routes Instagram uses in the authenticated page.
 * The routes are intentionally isolated here because Instagram can change them.
 */
export class InstagramClient implements MediaClient {
	readonly #fetch: typeof fetch;

	constructor(fetcher: typeof fetch) {
		this.#fetch = fetcher;
	}

	async getMedia(identity: PostIdentity): Promise<PostMedia> {
		const response = await this.#fetch(`${INSTAGRAM_MEDIA_INFO_ORIGIN}/api/v1/media/${encodeURIComponent(identity.mediaId)}/info/`, {
			credentials: 'include',
			headers: this.#headers(),
			mode: 'cors',
		});
		const payload: unknown = await response.json().catch(() => undefined);
		if (!response.ok) {
			throw new Error(instagramError(payload, `Could not load media (${response.status}).`));
		}
		return parseMediaResponse(payload, identity);
	}

	#headers(): HeadersInit {
		return {
			Accept: '*/*',
			'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
			'X-Requested-With': 'XMLHttpRequest',
		};
	}
}
