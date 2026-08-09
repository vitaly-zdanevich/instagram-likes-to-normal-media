/** A browser-native media element to render inside a liked-post tile. */
export interface MediaAsset {
	height?: number;
	kind: 'image' | 'video';
	poster?: string;
	src: string;
	width?: number;
}

/** Normalized media returned for one Instagram post, including its mutation ID. */
export interface PostMedia {
	assets: MediaAsset[];
	description?: string;
	mediaId: string;
	permalink: string;
	shortcode: string;
}

/** Identifiers derived from an Instagram thumbnail cache key. */
export interface PostIdentity {
	mediaId: string;
	permalink: string;
	shortcode: string;
}

/** The small API surface the page enhancer requires. */
export interface MediaClient {
	getMedia(identity: PostIdentity): Promise<PostMedia>;
}
