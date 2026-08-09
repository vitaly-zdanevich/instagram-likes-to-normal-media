import type { ClipboardAccess } from './clipboard.ts';
import { copyPermalink } from './clipboard.ts';
import type { DownloadAccess } from './download.ts';
import { downloadVideo, videoFilename } from './download.ts';
import { identityFromThumbnail } from './media.ts';
import { STYLES } from './styles.ts';
import type { MediaAsset, MediaClient, PostIdentity, PostMedia } from './types.ts';

const TILE_SELECTOR = '[role="button"], [data-bloks-name="bk.components.Flexbox"]';
const IMAGE_SELECTOR = 'img[src*="ig_cache_key"]';

interface EnhancerOptions {
	clipboard: ClipboardAccess;
	client: MediaClient;
	document: Document;
	downloader?: DownloadAccess;
	reportError?: (message: string, error: unknown) => void;
}

/** Enhances dynamically loaded Likes-page tiles without replacing Instagram's page. */
export class LikesEnhancer {
	readonly #clipboard: ClipboardAccess;
	readonly #client: MediaClient;
	readonly #document: Document;
	readonly #downloader: DownloadAccess;
	readonly #mediaRequests = new Map<string, Promise<PostMedia>>();
	readonly #reportError: (message: string, error: unknown) => void;
	#observer?: MutationObserver;

	constructor(options: EnhancerOptions) {
		this.#clipboard = options.clipboard;
		this.#client = options.client;
		this.#document = options.document;
		this.#downloader = options.downloader ?? {};
		this.#reportError = options.reportError ?? (() => undefined);
	}

	/** Starts observing Instagram's infinite, client-rendered collection. */
	start(): void {
		if (this.#document.getElementById('iglm-styles')) return;
		const style = this.#document.createElement('style');
		style.id = 'iglm-styles';
		style.textContent = STYLES;
		(this.#document.head ?? this.#document.documentElement).append(style);
		this.scan(this.#document);

		const Observer = this.#document.defaultView?.MutationObserver;
		if (!Observer) return;
		this.#observer = new Observer((records) => {
			for (const record of records) {
				if (record.type === 'attributes' && record.target instanceof this.#document.defaultView!.Element) {
					this.scan(record.target);
				}
				for (const node of record.addedNodes) {
					if (node instanceof this.#document.defaultView!.Element) this.scan(node);
				}
			}
		});
		this.#observer.observe(this.#document.documentElement, {
			attributeFilter: ['src'],
			attributes: true,
			childList: true,
			subtree: true,
		});
	}

	/** Stops observing, primarily for tests and hot-reload development. */
	stop(): void {
		this.#observer?.disconnect();
	}

	/** Enhances every eligible tile under a document or newly added subtree. */
	scan(root: Document | Element): void {
		if (root instanceof this.#document.defaultView!.HTMLImageElement && root.matches(IMAGE_SELECTOR)) {
			this.#enhance(root);
		}
		for (const image of root.querySelectorAll<HTMLImageElement>(IMAGE_SELECTOR)) this.#enhance(image);
	}

	#enhance(image: HTMLImageElement): void {
		const tile = image.closest<HTMLElement>(TILE_SELECTOR) ?? image.parentElement;
		if (!tile) return;
		if (tile.dataset.iglmEnhanced === 'true') return;
		const identity = identityFromThumbnail(image.src);
		if (!identity) return;
		tile.dataset.iglmEnhanced = 'true';
		tile.classList.add('iglm-tile');
		const actions = this.#actions(identity);
		tile.append(actions);

		const request = this.#mediaRequests.get(identity.mediaId)
			?? this.#client.getMedia(identity);
		this.#mediaRequests.set(identity.mediaId, request);
		void request.then((media) => {
			const link = actions.querySelector<HTMLAnchorElement>('a');
			if (link) {
				link.href = media.permalink;
				link.title = media.permalink;
			}
			this.#addDownload(actions, media);
			if (media.assets.some((asset) => asset.kind === 'video') || media.assets.length > 1) {
				const { element, videoFrames } = this.#mediaStage(media.assets, image.alt);
				tile.classList.add('iglm-has-stage');
				tile.append(element);
				for (const [frame, asset] of videoFrames) this.#mountVideo(frame, asset);
			}
		}).catch((error: unknown) => {
			this.#reportError(`Could not load media ${identity.mediaId}.`, error);
			const warning = this.#document.createElement('span');
			warning.className = 'iglm-warning';
			warning.textContent = '⚠️';
			warning.title = error instanceof Error ? error.message : 'Could not load playable media.';
			actions.append(warning);
		});
	}

	#actions(identity: PostIdentity): HTMLElement {
		const actions = this.#document.createElement('div');
		actions.className = 'iglm-actions';
		actions.setAttribute('aria-label', 'Instagram Likes Media actions');

		const link = this.#document.createElement('a');
		link.href = identity.permalink;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = 'Post';
		link.title = identity.permalink;
		link.addEventListener('click', (event) => event.stopPropagation());

		const copy = this.#document.createElement('button');
		copy.className = 'iglm-copy';
		copy.type = 'button';
		copy.textContent = '📋';
		copy.title = 'Copy post link';
		copy.setAttribute('aria-label', 'Copy post link');
		copy.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			void copyPermalink(link.href, this.#clipboard).then(() => {
				copy.textContent = '✅';
				copy.title = 'Copied';
				this.#document.defaultView?.setTimeout(() => {
					copy.textContent = '📋';
					copy.title = 'Copy post link';
				}, 1200);
			}).catch((error: unknown) => {
				copy.textContent = '⚠️';
				copy.title = error instanceof Error ? error.message : 'Could not copy link.';
			});
		});

		actions.append(link, copy);
		return actions;
	}

	/** Adds a named download for the first video in a post or carousel. */
	#addDownload(actions: HTMLElement, media: PostMedia): void {
		const asset = media.assets.find((candidate) => candidate.kind === 'video');
		if (!asset || !this.#downloader.managerDownload) return;
		const filename = videoFilename(media.description, media.shortcode, asset.src);
		const button = this.#document.createElement('button');
		button.className = 'iglm-download';
		button.type = 'button';
		button.textContent = '⬇️';
		button.title = `Download ${filename}`;
		button.setAttribute('aria-label', `Download video as ${filename}`);
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			try {
				downloadVideo(asset.src, filename, this.#downloader);
				button.textContent = '✅';
				button.title = `Download started: ${filename}`;
			} catch (error: unknown) {
				button.textContent = '⚠️';
				button.title = error instanceof Error ? error.message : 'Could not download video.';
			}
		});
		actions.append(button);
	}

	#mediaStage(assets: MediaAsset[], alt: string): {
		element: HTMLElement;
		videoFrames: Array<[HTMLIFrameElement, MediaAsset]>;
	} {
		const stage = this.#document.createElement('div');
		stage.className = 'iglm-stage';
		const track = this.#document.createElement('div');
		track.className = 'iglm-track';
		const videoFrames: Array<[HTMLIFrameElement, MediaAsset]> = [];

		for (const asset of assets) {
			if (asset.kind === 'video') {
				const frame = this.#document.createElement('iframe');
				frame.className = 'iglm-media-frame';
				frame.title = alt ? `${alt} video` : 'Liked Instagram video';
				frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
				frame.setAttribute('allowfullscreen', '');
				track.append(frame);
				videoFrames.push([frame, asset]);
			} else {
				const image = this.#document.createElement('img');
				image.alt = alt;
				image.loading = 'lazy';
				image.src = asset.src;
				track.append(image);
			}
		}
		stage.append(track);

		if (assets.length > 1) {
			stage.append(
				this.#carouselButton('‹', -1, track),
				this.#carouselButton('›', 1, track),
			);
		}

		for (const eventName of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) {
			stage.addEventListener(eventName, (event) => event.stopPropagation());
		}
		for (const eventName of ['click', 'dblclick']) {
			stage.addEventListener(eventName, (event) => {
				event.preventDefault();
				event.stopPropagation();
			});
		}
		return { element: stage, videoFrames };
	}

	/**
	 * Mounts video controls in a separate browsing context. Events inside an
	 * iframe cannot enter Instagram's capture-phase click handlers on the tile.
	 */
	#mountVideo(frame: HTMLIFrameElement, asset: MediaAsset): void {
		const mount = (): void => {
			const frameDocument = frame.contentDocument;
			if (!frameDocument?.body) return;

			frameDocument.documentElement.style.cssText = 'background:#000;height:100%';
			frameDocument.body.style.cssText = 'background:#000;height:100%;margin:0;overflow:hidden';
			const video = frameDocument.createElement('video');
			video.controls = true;
			video.playsInline = true;
			video.preload = 'metadata';
			video.src = asset.src;
			video.style.cssText = 'background:#000;display:block;height:100%;object-fit:contain;width:100%';
			if (asset.poster) video.poster = asset.poster;
			frameDocument.body.replaceChildren(video);
		};

		if (frame.contentDocument?.body) mount();
		else frame.addEventListener('load', mount, { once: true });
	}

	#carouselButton(label: string, direction: -1 | 1, track: HTMLElement): HTMLButtonElement {
		const button = this.#document.createElement('button');
		button.className = 'iglm-carousel-button';
		button.type = 'button';
		button.textContent = label;
		button.setAttribute('aria-label', direction < 0 ? 'Previous media' : 'Next media');
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
		});
		return button;
	}
}
