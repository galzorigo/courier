# Courier

A dev only overlay for editing styles on your running site. Pick an element, tweak it with real controls, and copy an exact list of before → after values for your coding agent. No AI inside, and it never writes to your source files.

## Workspace

```
packages/courier/      the npm package, published as @galzorigo/courier (see its README)
  src/core/            framework agnostic: property table, reading, relevance,
                       change store, scope, sibling spacing, export
  src/ui/              Preact UI in a Shadow DOM (bundled, ~15 KB gzip total)
  test/                vitest unit tests for core
playground/            mockup landing page (React + Vite) to test every feature
e2e/                   Playwright tests against the playground
```

## Commands

```bash
npm install
npm run dev        # builds courier in watch mode + playground at http://localhost:5173 (also on your LAN)
npm test           # core unit tests
npm run e2e        # end to end tests in Chromium (uses port 5174)
npm run typecheck
```

## Using it in an app

```bash
npm i -D @galzorigo/courier
```

```ts
if (import.meta.env.DEV) {
  import('@galzorigo/courier').then((c) => c.mount())
}
```

`mount()` returns an `unmount` function. `mount({ resolveSource })` takes a function that maps an element to `{ file, line }`. Nothing ships for that yet, and the export prints a placeholder line until one is plugged in.

## Testing each feature in the playground

1. **Inspect and selection.** Click the black launcher at bottom right. Hover the page: a blue box follows the pointer. Click the LinkedIn chip: it gets selected and the link does not open.
2. **Tabs.** One category at a time, with Size and Spacing sharing a tab. Each tab shows a blue count of pending changes. Scroll the tab bar with the mouse wheel or by dragging it, and the panel height eases to fit each tab. The tab you last opened stays open as you select other elements. An element only shows what it owns: its own text, plus direct child icons and unstyled label spans. Select the hero and you get Layout, Size and Spacing only. Select a chip and you also get Text and Icon.
3. **Layout.** Direction, Align and Distribute appear only for flex and grid. Switch Direction to column and the Align icons rotate.
4. **Size.** Width and Height each have Fixed, Hug or Fill. Switching back to the original mode removes the change, and the export records how the element was sized ("auto (hugs content, 56px) → 80px"). On a chip, Fill sets `flex-grow`. On a heading, Fill is the default and Hug shrinks it to its text. Typing a number switches to Fixed.
5. **Gap controls.** On a chip, "Gap between siblings" edits the parent's gap ("Set on parent, affects all 4"). On a feature item it's a margin on the element. On the nav logo it's read only, because the spacing comes from `space-between`.
6. **Editing like a design tool.** Every control is 28px tall with 6px corners, and all text is 14px. Drag a field's prefix (W, H, the padding icons) sideways to scrub. Arrow keys nudge (Shift for 10, Alt for 0.1). Clear a field, or focus one holding a keyword like `normal`, and its choices open: keywords plus unit conversions. Typing closes them. Padding, margin, radius and border width have a toggle for individual sides. Click a color swatch for the hex picker, which shows a saturation square, hue, opacity and the colors already on the page.
7. **Icons.** On a chip, the Icon tab edits its arrow. With "Apply to all 3 matching" ticked, all three arrows change.
8. **Scope.** On X, tick "Apply to all 3 matching elements". GitHub and Mail get dashed outlines and edits apply to all three.
9. **Save and copy.** Save stores your edits and closes the panel. The copy icon's badge counts saved changes. Cancel drops only the edits made since the last Save. The copy icon copies everything, including unsaved edits, then clears.
10. **Add what's missing.** Select a plain heading, open Appearance, and use + Fill, + Radius or + Border. Fill opens the picker right away, and Border adds a visible 1px solid border. Elements with no padding or margin get + Spacing under Layout.
11. **Reloads.** Make some changes, save some of them, then reload. Courier restores them (including which are saved) and says how many came back. If the page changed and an element can't be found, it says so and drops that change instead of guessing.
12. **Undo.** Cmd+Z and Cmd+Shift+Z, or the arrows in the panel header. Each changed row shows a blue dot and a reset button.

Escape deselects, then closes.
