import type { MediaAsset, PostIdentity, PostMedia } from './types.ts';

const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MEDIA_ID_DIGITS = 19;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asIdentifier(value: unknown): string | undefined {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
	return asString(value);
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecords(value: unknown): UnknownRecord[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function bestCandidate(value: unknown): UnknownRecord | undefined {
	return asRecords(value)
		.filter((candidate) => asString(candidate.url))
		.sort((left, right) => {
			const leftArea = (asNumber(left.width) ?? 0) * (asNumber(left.height) ?? 0);
			const rightArea = (asNumber(right.width) ?? 0) * (asNumber(right.height) ?? 0);
			return rightArea - leftArea;
		})[0];
}

function imageCandidate(node: UnknownRecord): UnknownRecord | undefined {
	const versions = isRecord(node.image_versions2) ? node.image_versions2 : undefined;
	return bestCandidate(versions?.candidates);
}

function parseAsset(node: UnknownRecord): MediaAsset | undefined {
	const poster = imageCandidate(node);
	const video = bestCandidate(node.video_versions);

	if (video) {
		const src = asString(video.url);
		if (!src) return undefined;
		const posterUrl = asString(poster?.url);
		const width = asNumber(video.width);
		const height = asNumber(video.height);
		return {
			kind: 'video',
			src,
			...(posterUrl ? { poster: posterUrl } : {}),
			...(width !== undefined ? { width } : {}),
			...(height !== undefined ? { height } : {}),
		};
	}

	const src = asString(poster?.url);
	if (!src) return undefined;
	const width = asNumber(poster?.width);
	const height = asNumber(poster?.height);
	return {
		kind: 'image',
		src,
		...(width !== undefined ? { width } : {}),
		...(height !== undefined ? { height } : {}),
	};
}

/** Converts Instagram's numeric media identifier to its public shortcode. */
export function mediaIdToShortcode(mediaId: string): string {
	let value = BigInt(mediaId);
	let shortcode = '';

	do {
		shortcode = SHORTCODE_ALPHABET[Number(value % 64n)] + shortcode;
		value /= 64n;
	} while (value > 0n);

	return shortcode;
}

/**
 * Extracts a media identifier and permalink from the `ig_cache_key` carried
 * by thumbnails on Instagram's Likes activity page.
 */
export function identityFromThumbnail(src: string, decode = globalThis.atob): PostIdentity | undefined {
	let cacheKey: string | null;
	try {
		cacheKey = new URL(src, 'https://www.instagram.com/').searchParams.get('ig_cache_key');
	} catch {
		return undefined;
	}
	if (!cacheKey) return undefined;

	try {
		const encoded = cacheKey.split('.')[0]?.replaceAll('-', '+').replaceAll('_', '/');
		if (!encoded) return undefined;
		const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
		const decodedId = decode(padded).match(/^\d+/)?.[0];
		if (!decodedId) return undefined;
		// Carousel cache keys can concatenate the 19-digit media and owner IDs.
		const mediaId = decodedId.slice(0, MEDIA_ID_DIGITS);
		const shortcode = mediaIdToShortcode(mediaId);
		return {
			mediaId,
			shortcode,
			permalink: `https://www.instagram.com/p/${shortcode}/`,
		};
	} catch {
		return undefined;
	}
}

/** Normalizes Instagram's private media-info response for native rendering. */
export function parseMediaResponse(payload: unknown, identity: PostIdentity): PostMedia {
	if (!isRecord(payload)) throw new Error('Instagram returned an invalid media response.');
	const root = asRecords(payload.items)[0];
	if (!root) throw new Error('Instagram returned no media for this post.');

	const carousel = asRecords(root.carousel_media);
	const assets = (carousel.length > 0 ? carousel : [root])
		.map(parseAsset)
		.filter((asset): asset is MediaAsset => Boolean(asset));
	if (assets.length === 0) throw new Error('Instagram returned no playable media URL.');

	const shortcode = asString(root.code) ?? identity.shortcode;
	const caption = isRecord(root.caption) ? asString(root.caption.text) : undefined;
	const user = isRecord(root.user) ? root.user : undefined;
	const username = asString(user?.username);
	return {
		assets,
		...(username ? {
			author: {
				name: username,
				profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`,
			},
		} : {}),
		...(caption ? { description: caption } : {}),
		mediaId: asIdentifier(root.id) ?? asIdentifier(root.pk) ?? identity.mediaId,
		shortcode,
		permalink: `https://www.instagram.com/p/${shortcode}/`,
	};
}

/** Extracts a useful message from an Instagram error response. */
export function instagramError(payload: unknown, fallback: string): string {
	if (!isRecord(payload)) return fallback;
	return asString(payload.message) ?? asString(payload.error_title) ?? fallback;
}
