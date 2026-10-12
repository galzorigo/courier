// Lives inside the shadow root. `all: initial` on the host stops inherited
// page styles (font, color, line height) from leaking in.
//
// System: every button and field is 28px tall with 6px corners, and all text
// is 14px. Badge counts are the one exception, to fit their 18px circle.

export const css = /* css */ `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.root {
  --bg: #1c1c1c;
  --body: #252525;
  --chip: #333333;
  --chip-hover: #3c3c3c;
  --field: #303030;
  --line: rgba(255, 255, 255, 0.07);
  /* Dark mode depth. On a dark page a shadow has nothing darker to sit on and
     smears into a halo, so a light hairline draws the edge. Shadows stay tight
     and do their work on light pages, where the hairline disappears. */
  --ring: 0 0 0 1px rgba(255, 255, 255, 0.1);
  --lift: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.24);
  --pill-shadow: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)) drop-shadow(0 6px 16px rgba(0, 0, 0, 0.22));
  --text: #ffffff;
  --muted: #8c8c8c;
  --blue: #2b6ef6;
  --hl: #3b82f6;
  --red: #ef4444;
  --h: 28px;
  --r: 6px;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font: 500 14px/1.3 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  letter-spacing: -0.01em;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
/* On a dark page the ambient shadow bands into a flat disc, so only the
   hairline and a tight contact shadow remain. */
.root.on-dark {
  --lift: 0 1px 2px rgba(0, 0, 0, 0.4);
  --pill-shadow: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

button, input, select, textarea { font: inherit; letter-spacing: inherit; color: inherit; }
/* Labels, tabs and buttons aren't content: only what you type is selectable. */
.root { -webkit-user-select: none; user-select: none; }
input, textarea { -webkit-user-select: text; user-select: text; }
/* Our own highlight: a page's ::selection reaches in here, and a subtle one
   (a few percent black) is invisible on the dark fields, so a selected value
   looked unselected. */
::selection { background: rgba(59, 130, 246, 0.45); color: #fff; }
button { cursor: pointer; border: 0; background: none; padding: 0; }
button:disabled { cursor: default; opacity: 0.4; }
:focus-visible { outline: 2px solid var(--hl); outline-offset: 1px; }

/* The inspect layer: invisible, catches the pointer so the page shows no hover states. */
.shield { position: fixed; inset: 0; pointer-events: auto; }

/* Highlights on the page */
.hl { position: fixed; pointer-events: none; }
.hl-hover { border: 1.5px solid var(--hl); background: rgba(59, 130, 246, 0.08); }
.hl-selected { border: 2px solid var(--hl); }
.hl-match { border: 1.5px dashed var(--hl); }
.hl-label {
  position: absolute;
  font-family: "Courier Paper Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 500;
  letter-spacing: 0;
  left: -2px;
  bottom: calc(100% + 4px);
  background: var(--hl);
  color: #fff;
  padding: 3px 7px;
  border-radius: var(--r);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.hl-label.below { bottom: auto; top: calc(100% + 4px); }

/* Dock: panel stacked over toolbar */
.dock {
  position: fixed;
  right: 48px;
  bottom: 48px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  max-width: calc(100vw - 64px);
}
.dock.left { right: auto; left: 48px; align-items: flex-start; }
/* Phones: 48px each side would leave too little panel. */
@media (max-width: 480px) {
  .dock { right: 16px; bottom: 16px; max-width: calc(100vw - 32px); }
  .panel { height: min(540px, calc(100vh - 92px)); }
  .dock.left { left: 16px; }
}

.panel { pointer-events: auto; box-shadow: var(--ring), var(--lift); }
/* Opened by a click from nothing: grows out of the dock corner. Settles on
   transform none, since any transform would contain the fixed menus. */
.panel[data-enter] {
  transform-origin: bottom right;
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
  @starting-style { opacity: 0; transform: translateY(6px) scale(0.98); }
}
.dock.left .panel[data-enter] { transform-origin: bottom left; }

/*
 * Toolbar: 40px circles in a pill with 4px padding (48px tall). The launcher
 * is the last button, so collapsed the pill is just clipped to its last 48px;
 * opening unclips leftwards to reveal the eye and copy buttons while the
 * pencil turns into the close button in place. Shadow lives on the wrapper
 * as drop-shadow, since clip-path would cut a box-shadow off. The first
 * drop-shadow, a white one with almost no blur, is the hairline: it follows
 * the clipped shape, so the edge is right collapsed, open and in between.
 */
.toolbar-wrap {
  position: relative;
  pointer-events: none;
  filter: drop-shadow(0 0 0.5px rgba(255, 255, 255, 0.3)) var(--pill-shadow);
}
.toolbar {
  pointer-events: auto;
  padding: 4px;
  border-radius: 24px;
  background: var(--bg);
  clip-path: inset(0 0 0 calc(100% - 48px) round 24px);
  transition: clip-path 200ms var(--ease-out);
}
.toolbar-row { display: flex; gap: 4px; }
/* Opening takes a little longer than closing: the system answering is fast, the reveal is shown. */
.toolbar.open { clip-path: inset(0 round 24px); transition-duration: 260ms; }
.toolbar.instant, .toolbar.instant .morph { transition: none; }

/* Pencil to close: a short crossfade with a quarter turn, blur bridging the two shapes. */
.morph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transition: opacity 160ms var(--ease-out), transform 160ms var(--ease-out), filter 160ms var(--ease-out);
}
.launcher .x, .launcher.is-open .pencil { opacity: 0; transform: rotate(-45deg) scale(0.7); filter: blur(2px); }
.launcher.is-open .x { opacity: 1; transform: none; filter: none; }
.tool {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
}
@media (hover: hover) and (pointer: fine) {
  .tool:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); }
}
.tool.on { background: rgba(255, 255, 255, 0.12); }
.tool-icon { display: grid; }
/* Two icons in one spot, crossfading, with a little blur so the two shapes
   read as one changing. Asymmetric: turning into the check answers a click,
   so it snaps like the pencil and close morph; turning back happens on its
   own while you look elsewhere, so it morphs gently enough to be seen. */
.swap-box { position: relative; width: 18px; height: 18px; }
.swap {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transition: opacity 240ms var(--ease-in-out), transform 240ms var(--ease-in-out), filter 240ms var(--ease-in-out);
}
.swap-box.copied .swap { transition-duration: 160ms; transition-timing-function: var(--ease-out); }
.swap.off { opacity: 0; transform: scale(0.8); filter: blur(2px); }
/* Above the pill, centered over the button it's about. While the panel is
   open that space is the panel's footer, so it moves beside the pill. */
.toast {
  width: max-content;
  position: absolute;
  /* Left is set from the button it's about; translate centers it there. */
  translate: -50% 0;
  bottom: calc(100% + 8px);
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
  @starting-style { opacity: 0; transform: translateY(4px); }
  padding: 4px 8px;
  border-radius: var(--r);
  background: #000;
  color: #fff;
  white-space: nowrap;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16);
}
.toast.beside {
  translate: none;
  right: calc(100% + 8px);
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
  /* Switching sides is a jump, not a move: only the fade carries over. */
  transition-property: opacity;
  @starting-style { opacity: 0; }
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--blue);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.tool .badge { top: -1px; right: -1px; box-shadow: 0 0 0 2px var(--bg); }
.launcher-badge { top: -4px; right: -4px; box-shadow: 0 0 0 2px var(--bg); }

/* Panel */
/* A fixed height, so switching tabs never resizes the panel; the body scrolls.
   Never taller than the space above the toolbar (48px inset, 48px toolbar, gap). */
.panel {
  width: 360px;
  max-width: 100%;
  height: min(540px, calc(100vh - 124px));
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  background: var(--bg);
  overflow: hidden;
}
.panel-head { display: flex; align-items: center; gap: 4px; padding: 12px 12px 0 16px; cursor: grab; }
.panel-head:active { cursor: grabbing; }
.panel-title { flex: 1; min-width: 0; }
.panel-title h2, .panel-title p {
  margin: 0;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-title h2 { font-weight: 500; }
.panel-title p { color: var(--muted); }
.panel-body {
  flex: 1;
  min-height: 0;
  background: var(--body);
  padding: 10px 16px 12px;
  overflow: auto;
  overscroll-behavior: contain;
  border-bottom: 1px solid var(--line);
}
/* Holds the scroll area and the "more below" arrow, which floats over its bottom edge. */
.body-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.scroll-more {
  position: absolute;
  left: 50%;
  bottom: 12px;
  width: var(--h);
  height: var(--h);
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #3a3a3a;
  color: #fff;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 3px 8px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  opacity: 0;
  transform: translate(-50%, 4px);
  pointer-events: none;
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
}
/* While there's more below, the content fades out under the arrow. A layer on
   top, not a mask, so menus opened inside the body aren't clipped by it. */
.body-wrap::after {
  content: '';
  position: absolute;
  left: 0;
  right: 8px;
  bottom: 0;
  height: 64px;
  z-index: 1;
  background: linear-gradient(to bottom, transparent, var(--body));
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms var(--ease-out);
}
.body-wrap.fade-bottom::after { opacity: 1; }
.scroll-more { z-index: 2; }
.scroll-more.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.scroll-more:hover { background: #454545; }
@media (prefers-reduced-motion: reduce) { .scroll-more { transform: translate(-50%, 0); } }
.panel-foot { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; align-items: center; gap: 8px; }
.spread { justify-content: space-between; }

.icon-btn {
  width: var(--h);
  height: var(--h);
  flex: none;
  border-radius: var(--r);
  background: var(--chip);
  display: grid;
  place-items: center;
  color: #fff;
}
.icon-btn.flat { background: none; color: var(--muted); }
/* Press feedback on everything pressable. Fields and menu rows are left still. */
.tool, .icon-btn, .btn, .add-btn { transition: transform 160ms var(--ease-out); }
.tool:active:not(:disabled), .icon-btn:active:not(:disabled), .btn:active:not(:disabled), .add-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.icon-btn:hover:not(:disabled) { background: var(--chip-hover); color: #fff; }
.icon-btn.flat.on { background: #3a3a3a; color: #fff; }

/* Scrollbars: 4px, white at 10%, no track. Chrome 121+ ignores the
   ::-webkit-scrollbar styles once scrollbar-width or scrollbar-color is set,
   so those standard properties are only for Firefox (which can't go below "thin"). */
@supports not selector(::-webkit-scrollbar) {
  .panel-body, .choices, .preview { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.1) transparent; }
}
/* 8px wide with a 4px transparent border on the right: a 4px bar sitting 4px in from the edge. */
.panel-body::-webkit-scrollbar, .choices::-webkit-scrollbar, .preview::-webkit-scrollbar { width: 8px; height: 8px; }
.panel-body::-webkit-scrollbar-track, .choices::-webkit-scrollbar-track, .preview::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
.panel-body::-webkit-scrollbar-thumb, .choices::-webkit-scrollbar-thumb, .preview::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  background-clip: padding-box;
  border-right: 4px solid transparent;
  border-radius: 6px;
}

/* Category tabs: underline style, scroll sideways with faded edges */
.tabs {
  position: relative;
  display: flex;
  gap: 18px;
  /* Top room for the count badge: the scroller clips anything outside its padding box. */
  padding: 8px 16px 0;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--line);
  --fade: 28px;
}
.tabs::-webkit-scrollbar { display: none; }
.tabs.fade-right { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent); mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent); }
.tabs.fade-left { -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade)); mask-image: linear-gradient(to right, transparent, #000 var(--fade)); }
.tabs.fade-left.fade-right {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
}
.tab {
  flex: none;
  display: flex;
  align-items: center;
  height: var(--h);
  padding: 0;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  white-space: nowrap;
}
.tab:hover { color: #fff; }
.tab.on { color: #fff; border-bottom-color: #fff; }
/* The count sits over the corner; half its width is added as padding so the label stays readable. */
.tab { position: relative; }
.tab.has-count { padding-right: 9px; }
.tab-count {
  position: absolute;
  top: -7px;
  right: -9px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--blue);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Rows: label aligned to the first line of controls */
.prow {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) var(--h);
  grid-template-areas: "label ctl reset" ". note note";
  align-items: start;
  column-gap: 8px;
  row-gap: 6px;
  padding: 4px 0;
}
.prow.stacked {
  grid-template-columns: minmax(0, 1fr) var(--h);
  grid-template-areas: "label reset" "ctl ." "note .";
  row-gap: 4px;
  padding-top: 6px;
}
.plabel { grid-area: label; color: var(--muted); line-height: var(--h); white-space: nowrap; }
.prow.stacked .plabel { line-height: 20px; }
.prow.stacked .preset { height: 20px; }
.prow.changed .plabel { color: #fff; }
.prow.changed .plabel::after {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--blue);
  vertical-align: middle;
}
.pctl { grid-area: ctl; display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.pctl > .field, .pctl > .color-wrap { flex: 1; }
.pctl > .field.select:not(:only-child) { flex: 0 0 84px; }
.preset { grid-area: reset; height: var(--h); display: grid; place-items: center; }
.pnote { grid-area: note; margin: 0; color: var(--muted); }
.pnote.lead { margin: 0 0 6px; }
.pgroup { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.grid2 { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.grid2.one { grid-template-columns: 1fr; }
.empty { margin: 0; color: var(--muted); }

.reset {
  width: var(--h);
  height: var(--h);
  border-radius: var(--r);
  display: grid;
  place-items: center;
  color: var(--muted);
}
.reset:hover { color: #fff; background: var(--chip); }

.removed { display: flex; align-items: center; height: var(--h); color: var(--muted); }

/* Add a section the element doesn't use yet */
.add-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.add-row.lead { margin-top: 0; padding-top: 2px; border-top: 0; }
.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--h);
  padding: 0 10px 0 7px;
  border-radius: var(--r);
  background: var(--field);
  color: var(--muted);
}
.add-btn:hover { color: #fff; background: #3a3a3a; }

/* Fields */
.field {
  position: relative;
  display: flex;
  align-items: center;
  height: var(--h);
  min-width: 0;
  border-radius: var(--r);
  background: var(--field);
}
.field:focus-within { box-shadow: inset 0 0 0 1px var(--hl); }
.field.invalid { box-shadow: inset 0 0 0 1px var(--red); }
.field input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.field > input:first-child { padding-left: 9px; }
.field input::placeholder { color: var(--muted); }
.field.muted input, .field.readonly input { color: var(--muted); }
.prefix {
  flex: none;
  width: 26px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.prefix:hover { color: #fff; }
.prefix.static { cursor: default; }
.font-display {
  width: 100%;
  height: var(--h);
  padding: 0;
  text-align: left;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.font-display:hover { color: #fff; }
.prefix.static:hover { color: var(--muted); }
.suffix { flex: none; padding: 0 9px 0 2px; color: var(--muted); }
.suffix:empty { padding: 0; }
.suffix.scrub { cursor: ew-resize; touch-action: none; user-select: none; }

.field.select select {
  width: 100%;
  height: 100%;
  padding: 0 26px 0 9px;
  border: 0;
  background: none;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  text-overflow: ellipsis;
}
/* Only the chevron: the menu's check icons are svgs inside this field too. */
.field.select > svg { position: absolute; right: 9px; color: var(--muted); pointer-events: none; }
.select-btn {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 26px 0 9px;
  border-radius: var(--r);
  text-align: left;
}
.select-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field.select.open { box-shadow: inset 0 0 0 1px var(--hl); }
select option { color: #111; }

/* Choices: open while a typeable field is empty */
.choices {
  position: fixed;
  z-index: 5;
  max-height: 200px;
  overflow: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  /* Concentric: 6px items + 4px padding. */
  border-radius: 10px;
  background: #2b2b2b;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), var(--lift);
}
.choices.grow {
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
  @starting-style { opacity: 0; transform: scale(0.97); }
}
.choices button {
  width: 100%;
  height: var(--h);
  padding: 0 8px;
  border-radius: var(--r);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
}
.choices button span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choices button:hover:not(:disabled), .choices button.active { background: #3a3a3a; }
.choices button:disabled { color: var(--muted); cursor: default; opacity: 1; }
.choice-check { flex: none; width: 16px; display: grid; place-items: center; }
.choices button { justify-content: flex-start; }
.choice-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choice-hint { color: var(--muted); flex: none; }
.choice-swatch { flex: none; width: 16px; height: 16px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18); }

/* Color */
.color-wrap { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.field.color .hex { padding-left: 0; }
.field.color .alpha { flex: none; width: 32px; text-align: right; }
.divider { flex: none; width: 1px; height: 14px; margin: 0 6px; background: rgba(255, 255, 255, 0.12); }
.swatch { flex: none; width: var(--h); height: var(--h); display: grid; place-items: center; border-radius: var(--r); }
.swatch span {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}
.swatch.on span { box-shadow: 0 0 0 2px var(--hl); }

.picker { display: flex; flex-direction: column; gap: 10px; }
.sv {
  position: relative;
  height: 140px;
  border-radius: var(--r);
  cursor: crosshair;
  touch-action: none;
}
.sv::before, .sv::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.sv::before { background: linear-gradient(to right, #fff, transparent); }
.sv::after { background: linear-gradient(to top, #000, transparent); }
.slider { position: relative; height: 12px; border-radius: var(--r); cursor: pointer; touch-action: none; }
.hue { background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
.alpha {
  background-image: conic-gradient(#555 25%, #777 0 50%, #555 0 75%, #777 0);
  background-size: 8px 8px;
}
.alpha-fill { position: absolute; inset: 0; border-radius: inherit; }
.thumb {
  position: absolute;
  z-index: 1;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.slider .thumb { top: 50%; }
.palette { display: grid; grid-template-columns: repeat(auto-fill, var(--h)); gap: 6px; }
.palette button { width: var(--h); height: var(--h); border-radius: var(--r); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15); }

/* Segmented */
.seg {
  flex: 1;
  display: flex;
  height: var(--h);
  border-radius: var(--r);
  background: var(--field);
  min-width: 0;
}
.seg button {
  flex: 1;
  min-width: 0;
  height: var(--h);
  display: grid;
  place-items: center;
  padding: 0 6px;
  border-radius: var(--r);
  color: var(--muted);
  white-space: nowrap;
}
.seg button:hover:not(.on) { color: #fff; }
.seg button.on { background: var(--body); color: #fff; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); }
.seg-icon { display: grid; transition: transform 160ms var(--ease-out); }

/* Footer */
.check-row { position: relative; display: flex; align-items: center; gap: 10px; color: var(--muted); cursor: pointer; }
.check-row b { color: #fff; font-weight: 600; }
.check { position: absolute; width: 1px; height: 1px; opacity: 0; }
.check-box {
  width: 20px;
  height: 20px;
  border-radius: var(--r);
  background: #2e2e2e;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  display: grid;
  place-items: center;
  color: transparent;
  transition: background 120ms ease;
}
.check:checked + .check-box { background: #3d3d3d; color: #fff; box-shadow: none; }
.check:focus-visible + .check-box { outline: 2px solid var(--hl); outline-offset: 1px; }

.btn { height: var(--h); padding: 0 12px; border-radius: var(--r); }
.btn-ghost { background: #2e2e2e; color: #a3a3a3; }
.btn-ghost:hover:not(:disabled) { color: #fff; }
.btn-primary { background: #fff; color: #111; }

.preview {
  width: 100%;
  height: 220px;
  resize: none;
  padding: 10px 12px;
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: #2a2a2a;
  color: #d4d4d4;
  line-height: 1.5;
  outline: none;
}

/* Change markers on the page */
.marker {
  position: fixed;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--blue);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  box-shadow: 0 0 0 2px #fff, 0 2px 6px rgba(0, 0, 0, 0.2);
}

/* Overlays drawn above the panel */
/* Measured before it's placed: start at 0,0 at its natural width, so where it
   would otherwise land can't squeeze it (that clipped long tips near an edge). */
.tooltip {
  position: fixed;
  left: 0;
  top: 0;
  width: max-content;
  max-width: calc(100vw - 16px);
  z-index: 10;
  visibility: hidden;
  padding: 4px 8px;
  border-radius: var(--r);
  background: #000;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16), 0 2px 8px rgba(0, 0, 0, 0.3);
}
.popover {
  position: fixed;
  z-index: 8;
  padding: 12px;
  /* Concentric: 6px controls + 12px padding. */
  border-radius: 18px;
  background: #2a2a2a;
  pointer-events: auto;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), var(--lift);
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
  @starting-style { opacity: 0; transform: scale(0.97); }
}

/* Reduced motion: fades stay, since they explain what appeared. Movement,
   scaling and reveals go. */
@media (prefers-reduced-motion: reduce) {
  * { transition-property: opacity !important; }
  .tool:active, .icon-btn:active, .btn:active, .add-btn:active { transform: none !important; }
}
`
