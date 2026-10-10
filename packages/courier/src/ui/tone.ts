// Whether the page under Courier is dark. On a near black page a soft shadow
// has only a few shades to fade through, so it bands into a flat disc. There
// Courier drops the ambient shadow and lets its hairline edge do the work.

import { toHex } from '../core'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function pageIsDark(): boolean {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue
    const hex = toHex(getComputedStyle(el).backgroundColor)
    if (!hex || hex.length === 9 && hex.endsWith('00')) continue
    return luminance(hex) < 0.35
  }
  // No background set: the canvas follows the page's color scheme.
  return /^dark$|^dark\s|\sdark$/.test(getComputedStyle(document.documentElement).colorScheme.trim())
}

/** Keeps `on-dark` on the root in step with the page, through theme toggles and late styles. */
export function watchTone(root: HTMLElement): () => void {
  const update = () => root.classList.toggle('on-dark', pageIsDark())
  update()
  const observer = new MutationObserver(update)
  const attrs = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] }
  observer.observe(document.documentElement, attrs)
  if (document.body) observer.observe(document.body, attrs)
  observer.observe(document.head, { childList: true })
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', update)
  window.addEventListener('load', update)
  return () => {
    observer.disconnect()
    media.removeEventListener('change', update)
    window.removeEventListener('load', update)
  }
}
