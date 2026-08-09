/** Styles are namespaced so they cannot alter Instagram's own controls. */
export const STYLES = `
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
