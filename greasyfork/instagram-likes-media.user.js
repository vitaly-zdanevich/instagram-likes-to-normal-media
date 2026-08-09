// ==UserScript==
// @name         Instagram Likes Media
// @namespace    https://github.com/vitaly-zdanevich/instagram-likes-media
// @version      0.2.1
// @description  Instagram Likes page: replace thumbnails to normal video HTML tag, add button to copy a post link. Make compatible with Hover Zoom extension
// @match        https://www.instagram.com/your_activity/interactions/likes*
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        unsafeWindow
// @inject-into  content
// @run-at       document-idle
// @noframes
// ==/UserScript==
"use strict";
(() => {
  // src/media.ts
  var SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var MEDIA_ID_DIGITS = 19;
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function asString(value) {
    return typeof value === "string" && value.length > 0 ? value : void 0;
  }
  function asIdentifier(value) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    return asString(value);
  }
  function asNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function asRecords(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
  }
  function bestCandidate(value) {
    return asRecords(value).filter((candidate) => asString(candidate.url)).sort((left, right) => {
      const leftArea = (asNumber(left.width) ?? 0) * (asNumber(left.height) ?? 0);
      const rightArea = (asNumber(right.width) ?? 0) * (asNumber(right.height) ?? 0);
      return rightArea - leftArea;
    })[0];
  }
  function imageCandidate(node) {
    const versions = isRecord(node.image_versions2) ? node.image_versions2 : void 0;
    return bestCandidate(versions?.candidates);
  }
  function parseAsset(node) {
    const poster = imageCandidate(node);
    const video = bestCandidate(node.video_versions);
    if (video) {
      const src2 = asString(video.url);
      if (!src2) return void 0;
      const posterUrl = asString(poster?.url);
      const width2 = asNumber(video.width);
      const height2 = asNumber(video.height);
      return {
        kind: "video",
        src: src2,
        ...posterUrl ? { poster: posterUrl } : {},
        ...width2 !== void 0 ? { width: width2 } : {},
        ...height2 !== void 0 ? { height: height2 } : {}
      };
    }
    const src = asString(poster?.url);
    if (!src) return void 0;
    const width = asNumber(poster?.width);
    const height = asNumber(poster?.height);
    return {
      kind: "image",
      src,
      ...width !== void 0 ? { width } : {},
      ...height !== void 0 ? { height } : {}
    };
  }
  function mediaIdToShortcode(mediaId) {
    let value = BigInt(mediaId);
    let shortcode = "";
    do {
      shortcode = SHORTCODE_ALPHABET[Number(value % 64n)] + shortcode;
      value /= 64n;
    } while (value > 0n);
    return shortcode;
  }
  function identityFromThumbnail(src, decode = globalThis.atob) {
    let cacheKey;
    try {
      cacheKey = new URL(src, "https://www.instagram.com/").searchParams.get("ig_cache_key");
    } catch {
      return void 0;
    }
    if (!cacheKey) return void 0;
    try {
      const encoded = cacheKey.split(".")[0]?.replaceAll("-", "+").replaceAll("_", "/");
      if (!encoded) return void 0;
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      const decodedId = decode(padded).match(/^\d+/)?.[0];
      if (!decodedId) return void 0;
      const mediaId = decodedId.slice(0, MEDIA_ID_DIGITS);
      const shortcode = mediaIdToShortcode(mediaId);
      return {
        mediaId,
        shortcode,
        permalink: `https://www.instagram.com/p/${shortcode}/`
      };
    } catch {
      return void 0;
    }
  }
  function parseMediaResponse(payload, identity) {
    if (!isRecord(payload)) throw new Error("Instagram returned an invalid media response.");
    const root = asRecords(payload.items)[0];
    if (!root) throw new Error("Instagram returned no media for this post.");
    const carousel = asRecords(root.carousel_media);
    const assets = (carousel.length > 0 ? carousel : [root]).map(parseAsset).filter((asset) => Boolean(asset));
    if (assets.length === 0) throw new Error("Instagram returned no playable media URL.");
    const shortcode = asString(root.code) ?? identity.shortcode;
    const caption = isRecord(root.caption) ? asString(root.caption.text) : void 0;
    return {
      assets,
      ...caption ? { description: caption } : {},
      mediaId: asIdentifier(root.id) ?? asIdentifier(root.pk) ?? identity.mediaId,
      shortcode,
      permalink: `https://www.instagram.com/p/${shortcode}/`
    };
  }
  function instagramError(payload, fallback) {
    if (!isRecord(payload)) return fallback;
    return asString(payload.message) ?? asString(payload.error_title) ?? fallback;
  }

  // src/instagram.ts
  var INSTAGRAM_WEB_APP_ID = "936619743392459";
  var INSTAGRAM_MEDIA_INFO_ORIGIN = "https://i.instagram.com";
  var InstagramClient = class {
    #fetch;
    constructor(fetcher) {
      this.#fetch = fetcher;
    }
    async getMedia(identity) {
      const response = await this.#fetch(`${INSTAGRAM_MEDIA_INFO_ORIGIN}/api/v1/media/${encodeURIComponent(identity.mediaId)}/info/`, {
        credentials: "include",
        headers: this.#headers(),
        mode: "cors"
      });
      const payload = await response.json().catch(() => void 0);
      if (!response.ok) {
        throw new Error(instagramError(payload, `Could not load media (${response.status}).`));
      }
      return parseMediaResponse(payload, identity);
    }
    #headers() {
      return {
        Accept: "*/*",
        "X-IG-App-ID": INSTAGRAM_WEB_APP_ID,
        "X-Requested-With": "XMLHttpRequest"
      };
    }
  };

  // src/clipboard.ts
  async function copyPermalink(url, access) {
    if (access.managerWrite) {
      access.managerWrite(url, "text");
      return;
    }
    if (access.browserWrite) {
      await access.browserWrite(url);
      return;
    }
    throw new Error("No clipboard API is available.");
  }

  // src/download.ts
  var VIDEO_EXTENSIONS = /* @__PURE__ */ new Set(["m4v", "mov", "mp4", "webm"]);
  var WINDOWS_RESERVED_NAME = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/i;
  function videoExtension(sourceUrl) {
    try {
      const pathname = new URL(sourceUrl, "https://www.instagram.com/").pathname;
      const extension = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
      if (extension && VIDEO_EXTENSIONS.has(extension)) return extension;
    } catch {
    }
    return "mp4";
  }
  function safeFilenameBase(value) {
    const cleaned = value.normalize("NFKC").replace(/[\p{Cc}<>:"/\\|?*]+/gu, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 120);
    return WINDOWS_RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned;
  }
  function videoFilename(description, shortcode, sourceUrl) {
    const firstLine = description?.split(/\r?\n/, 1)[0] ?? "";
    const base = safeFilenameBase(firstLine) || safeFilenameBase(shortcode) || "instagram-video";
    return `${base}.${videoExtension(sourceUrl)}`;
  }
  function downloadVideo(url, filename, access) {
    if (!access.managerDownload) throw new Error("The userscript download API is unavailable.");
    access.managerDownload(url, filename);
  }

  // src/styles.ts
  var STYLES = `
.iglm-tile {
	position: relative !important;
	overflow: hidden !important;
}
.iglm-actions {
	align-items: center;
	background: rgba(0, 0, 0, .72);
	border-radius: 999px;
	display: flex;
	gap: 2px;
	left: 6px;
	max-width: calc(100% - 12px);
	padding: 3px;
	position: absolute;
	top: 6px;
	z-index: 2147483646;
}
.iglm-actions a,
.iglm-actions button {
	align-items: center;
	background: transparent;
	border: 0;
	border-radius: 999px;
	box-sizing: border-box;
	color: #fff;
	cursor: pointer;
	display: inline-flex;
	font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	height: 28px;
	justify-content: center;
	margin: 0;
	min-width: 28px;
	padding: 0 8px;
	text-decoration: none;
}
.iglm-actions a:hover,
.iglm-actions button:hover,
.iglm-actions a:focus-visible,
.iglm-actions button:focus-visible {
	background: rgba(255, 255, 255, .2);
	outline: 2px solid #fff;
}
.iglm-actions .iglm-copy,
.iglm-actions .iglm-download {
	font-size: 16px;
	padding: 0;
}
.iglm-actions button:disabled {
	cursor: wait;
	opacity: .65;
}
.iglm-stage {
	background: #000;
	inset: 0;
	position: absolute;
	z-index: 2147483645 !important;
}
.iglm-has-stage {
	pointer-events: none !important;
}
.iglm-has-stage > .iglm-actions,
.iglm-has-stage > .iglm-stage,
.iglm-has-stage .iglm-track,
.iglm-has-stage .iglm-media-frame {
	pointer-events: auto !important;
}
.iglm-track {
	display: flex;
	height: 100%;
	overflow-x: auto;
	scroll-behavior: smooth;
	scroll-snap-type: x mandatory;
	scrollbar-width: none;
	width: 100%;
}
.iglm-track::-webkit-scrollbar {
	display: none;
}
.iglm-track > img,
.iglm-track > .iglm-media-frame {
	background: #000;
	border: 0;
	flex: 0 0 100%;
	height: 100%;
	object-fit: contain;
	scroll-snap-align: start;
	width: 100%;
}
.iglm-carousel-button {
	background: rgba(0, 0, 0, .7);
	border: 0;
	border-radius: 50%;
	color: #fff;
	cursor: pointer;
	font: 700 20px/1 sans-serif;
	height: 32px;
	position: absolute;
	top: calc(50% - 16px);
	width: 32px;
	z-index: 3;
}
.iglm-carousel-button:first-of-type { left: 6px; }
.iglm-carousel-button:last-of-type { right: 6px; }
.iglm-warning {
	font-size: 15px;
	padding: 0 5px;
}
`;

  // src/ui.ts
  var TILE_SELECTOR = '[role="button"], [data-bloks-name="bk.components.Flexbox"]';
  var IMAGE_SELECTOR = 'img[src*="ig_cache_key"]';
  var LikesEnhancer = class {
    #clipboard;
    #client;
    #document;
    #downloader;
    #mediaRequests = /* @__PURE__ */ new Map();
    #reportError;
    #observer;
    constructor(options) {
      this.#clipboard = options.clipboard;
      this.#client = options.client;
      this.#document = options.document;
      this.#downloader = options.downloader ?? {};
      this.#reportError = options.reportError ?? (() => void 0);
    }
    /** Starts observing Instagram's infinite, client-rendered collection. */
    start() {
      if (this.#document.getElementById("iglm-styles")) return;
      const style = this.#document.createElement("style");
      style.id = "iglm-styles";
      style.textContent = STYLES;
      (this.#document.head ?? this.#document.documentElement).append(style);
      this.scan(this.#document);
      const Observer = this.#document.defaultView?.MutationObserver;
      if (!Observer) return;
      this.#observer = new Observer((records) => {
        for (const record of records) {
          if (record.type === "attributes" && record.target instanceof this.#document.defaultView.Element) {
            this.scan(record.target);
          }
          for (const node of record.addedNodes) {
            if (node instanceof this.#document.defaultView.Element) this.scan(node);
          }
        }
      });
      this.#observer.observe(this.#document.documentElement, {
        attributeFilter: ["src"],
        attributes: true,
        childList: true,
        subtree: true
      });
    }
    /** Stops observing, primarily for tests and hot-reload development. */
    stop() {
      this.#observer?.disconnect();
    }
    /** Enhances every eligible tile under a document or newly added subtree. */
    scan(root) {
      if (root instanceof this.#document.defaultView.HTMLImageElement && root.matches(IMAGE_SELECTOR)) {
        this.#enhance(root);
      }
      for (const image of root.querySelectorAll(IMAGE_SELECTOR)) this.#enhance(image);
    }
    #enhance(image) {
      const tile = image.closest(TILE_SELECTOR) ?? image.parentElement;
      if (!tile) return;
      if (tile.dataset.iglmEnhanced === "true") return;
      const identity = identityFromThumbnail(image.src);
      if (!identity) return;
      tile.dataset.iglmEnhanced = "true";
      tile.classList.add("iglm-tile");
      const actions = this.#actions(identity);
      tile.append(actions);
      const request = this.#mediaRequests.get(identity.mediaId) ?? this.#client.getMedia(identity);
      this.#mediaRequests.set(identity.mediaId, request);
      void request.then((media) => {
        const link = actions.querySelector("a");
        if (link) {
          link.href = media.permalink;
          link.title = media.permalink;
        }
        this.#addDownload(actions, media);
        if (media.assets.some((asset) => asset.kind === "video") || media.assets.length > 1) {
          const { element, videoFrames } = this.#mediaStage(media.assets, image.alt);
          tile.classList.add("iglm-has-stage");
          tile.append(element);
          for (const [frame, asset] of videoFrames) this.#mountVideo(frame, asset);
        }
      }).catch((error) => {
        this.#reportError(`Could not load media ${identity.mediaId}.`, error);
        const warning = this.#document.createElement("span");
        warning.className = "iglm-warning";
        warning.textContent = "\u26A0\uFE0F";
        warning.title = error instanceof Error ? error.message : "Could not load playable media.";
        actions.append(warning);
      });
    }
    #actions(identity) {
      const actions = this.#document.createElement("div");
      actions.className = "iglm-actions";
      actions.setAttribute("aria-label", "Instagram Likes Media actions");
      const link = this.#document.createElement("a");
      link.href = identity.permalink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Post";
      link.title = identity.permalink;
      link.addEventListener("click", (event) => event.stopPropagation());
      const copy = this.#document.createElement("button");
      copy.className = "iglm-copy";
      copy.type = "button";
      copy.textContent = "\u{1F4CB}";
      copy.title = "Copy post link";
      copy.setAttribute("aria-label", "Copy post link");
      copy.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void copyPermalink(link.href, this.#clipboard).then(() => {
          copy.textContent = "\u2705";
          copy.title = "Copied";
          this.#document.defaultView?.setTimeout(() => {
            copy.textContent = "\u{1F4CB}";
            copy.title = "Copy post link";
          }, 1200);
        }).catch((error) => {
          copy.textContent = "\u26A0\uFE0F";
          copy.title = error instanceof Error ? error.message : "Could not copy link.";
        });
      });
      actions.append(link, copy);
      return actions;
    }
    /** Adds a named download for the first video in a post or carousel. */
    #addDownload(actions, media) {
      const asset = media.assets.find((candidate) => candidate.kind === "video");
      if (!asset || !this.#downloader.managerDownload) return;
      const filename = videoFilename(media.description, media.shortcode, asset.src);
      const button = this.#document.createElement("button");
      button.className = "iglm-download";
      button.type = "button";
      button.textContent = "\u2B07\uFE0F";
      button.title = `Download ${filename}`;
      button.setAttribute("aria-label", `Download video as ${filename}`);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          downloadVideo(asset.src, filename, this.#downloader);
          button.textContent = "\u2705";
          button.title = `Download started: ${filename}`;
        } catch (error) {
          button.textContent = "\u26A0\uFE0F";
          button.title = error instanceof Error ? error.message : "Could not download video.";
        }
      });
      actions.append(button);
    }
    #mediaStage(assets, alt) {
      const stage = this.#document.createElement("div");
      stage.className = "iglm-stage";
      const track = this.#document.createElement("div");
      track.className = "iglm-track";
      const videoFrames = [];
      for (const asset of assets) {
        if (asset.kind === "video") {
          const frame = this.#document.createElement("iframe");
          frame.className = "iglm-media-frame";
          frame.title = alt ? `${alt} video` : "Liked Instagram video";
          frame.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
          frame.setAttribute("allowfullscreen", "");
          track.append(frame);
          videoFrames.push([frame, asset]);
        } else {
          const image = this.#document.createElement("img");
          image.alt = alt;
          image.loading = "lazy";
          image.src = asset.src;
          track.append(image);
        }
      }
      stage.append(track);
      if (assets.length > 1) {
        stage.append(
          this.#carouselButton("\u2039", -1, track),
          this.#carouselButton("\u203A", 1, track)
        );
      }
      for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"]) {
        stage.addEventListener(eventName, (event) => event.stopPropagation());
      }
      for (const eventName of ["click", "dblclick"]) {
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
    #mountVideo(frame, asset) {
      const mount = () => {
        const frameDocument = frame.contentDocument;
        if (!frameDocument?.body) return;
        frameDocument.documentElement.style.cssText = "background:#000;height:100%";
        frameDocument.body.style.cssText = "background:#000;height:100%;margin:0;overflow:hidden";
        const video = frameDocument.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = asset.src;
        video.style.cssText = "background:#000;display:block;height:100%;object-fit:contain;width:100%";
        if (asset.poster) video.poster = asset.poster;
        frameDocument.body.replaceChildren(video);
      };
      if (frame.contentDocument?.body) mount();
      else frame.addEventListener("load", mount, { once: true });
    }
    #carouselButton(label, direction, track) {
      const button = this.#document.createElement("button");
      button.className = "iglm-carousel-button";
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", direction < 0 ? "Previous media" : "Next media");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        track.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
      });
      return button;
    }
  };

  // src/main.ts
  function start() {
    const pageWindow = typeof unsafeWindow === "object" ? unsafeWindow : window;
    console.info("[Instagram Likes Media] active; waiting for Likes-page tiles.");
    document.documentElement.dataset.iglmActive = "true";
    const enhancer = new LikesEnhancer({
      client: new InstagramClient(pageWindow.fetch.bind(pageWindow)),
      clipboard: {
        ...typeof GM_setClipboard === "function" ? { managerWrite: GM_setClipboard } : {},
        ...navigator.clipboard?.writeText ? { browserWrite: navigator.clipboard.writeText.bind(navigator.clipboard) } : {}
      },
      document,
      downloader: {
        ...typeof GM_download === "function" ? { managerDownload: GM_download } : {}
      },
      reportError: (message, error) => console.error("[Instagram Likes Media]", message, error)
    });
    enhancer.start();
    return enhancer;
  }
  if (location.pathname.startsWith("/your_activity/interactions/likes")) start();
})();
