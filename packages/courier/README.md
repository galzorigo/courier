# Courier

Edit styles on your running site like in Figma, then copy an exact list of before and after values for your coding agent.

Instead of telling an agent "make the button bigger" and letting it guess, you pick the values yourself on the real page. Courier hands over exactly what you chose: which element, which properties, old value, new value, and whether the change belongs to one element or every matching one.

Development only. No AI inside, nothing sent anywhere, and it never writes to your files.

## Install

```bash
npm i -D @galzorigo/courier
```

## Set up

Load it only in development, so it never ships to production.

**Vite (React, Vue, Svelte, plain)**

```ts
// main.ts
if (import.meta.env.DEV) {
  import('@galzorigo/courier').then((c) => c.mount())
}
```

**Next.js (App Router)**

```tsx
// components/courier-dev.tsx
'use client'

import { useEffect } from 'react'

export default function CourierDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    let unmount: (() => void) | undefined
    import('@galzorigo/courier').then((c) => (unmount = c.mount()))
    return () => unmount?.()
  }, [])
  return null
}
```

```tsx
// app/layout.tsx, inside <body>
{process.env.NODE_ENV === 'development' && <CourierDev />}
```

`mount()` returns a function that removes the overlay and reverts any pending changes.

## Use

1. Click the pencil in the bottom right corner. Hover the page to highlight elements, click one to select it.
2. Edit it in the panel. Layout (display, direction, size as Fixed, Hug or Fill, gap, padding, margin), Appearance (fill, radius, border), Text and Icon. Only the controls that do something for that element are shown, and missing ones can be added.
3. Tick **Apply to all matching elements** to change every element that shares its style, including the same element inside repeated cards.
4. **Save**, then copy everything with the copy button and paste it into your agent.

The export looks like this:

```
## Scope: ALL 6 matching elements (p)
Selector: article > p
Classes: text-[15px] text-gray-400
Component: FeaturesPlanet (server component)
These elements share one style. Change the shared rule or component so all 6 update together.
  color: #99A1AF → #FFD166
```

### Handy keys

| Key | Does |
| --- | --- |
| Arrow up and down | Nudge a number (Shift for 10, Alt for 0.1) |
| Drag a field's label | Scrub the value |
| Shift Enter | Select the parent |
| Enter | Select the child |
| Cmd Z, Cmd Shift Z | Undo, redo |
| Escape | Close a menu, then the panel, then Courier |

### Good to know

- Edits apply as inline styles while you work. Nothing is written to your source.
- Changes survive a page reload in the same tab.
- On Tailwind sites, utility classes are left out of names and listed on a Classes line instead, the best handle for an agent to find the element.
- Edits apply at the current screen width. Check the export when your styles change at breakpoints.

## Options

```ts
mount({
  // Map an element to the file and line that renders it, added to the export.
  resolveSource: (el) => ({ file: 'src/components/Card.tsx', line: 12 }),
})
```

## License

MIT. Bundles a subset of [Paper Mono](https://github.com/paper-design/paper-mono) (SIL Open Font License 1.1) for the hover label, see THIRD_PARTY_LICENSES.md.
