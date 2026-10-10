// Colors and fonts already used on the page, offered as choices so edits
// stay inside the existing design.

import { toHex } from './read'

function scan(read: (cs: CSSStyleDeclaration) => string[], limit: number, skip: (v: string) => boolean): string[] {
  const counts = new Map<string, number>()
  for (const el of document.body.querySelectorAll('*')) {
    if (el.tagName === 'COURIER-OVERLAY') continue
    const cs = getComputedStyle(el)
    for (const v of read(cs)) if (!skip(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([v]) => v)
}

/** Most used solid colors on the page, as hex. */
export function pageColors(limit = 16): string[] {
  return scan(
    (cs) => {
      const out = [toHex(cs.color), toHex(cs.backgroundColor)]
      if (parseFloat(cs.borderTopWidth) > 0) out.push(toHex(cs.borderTopColor))
      return out.filter((c): c is string => !!c)
    },
    limit,
    (hex) => hex.length === 9 && hex.endsWith('00'),
  )
}

/** Font stacks used on the page, most used first. */
export function pageFonts(limit = 6): string[] {
  return scan((cs) => [cs.fontFamily], limit, (v) => !v)
}

export interface FontWeights {
  family: string
  /** A variable font renders any weight in its range. */
  variable: boolean
  weights: number[]
}

/** The weights the page actually loads for a font stack's first family. */
export function fontWeights(stack: string): FontWeights | null {
  const family = stack.split(',')[0].trim().replace(/["']/g, '')
  const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '').toLowerCase() === family.toLowerCase())
  if (!faces.length) return null
  const weights = new Set<number>()
  let variable = false
  for (const f of faces) {
    const parts = f.weight.split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)))
    if (parts.length === 2 && parts[0] !== parts[1]) variable = true
    else if (!Number.isNaN(parts[0])) weights.add(parts[0])
  }
  return { family, variable, weights: [...weights].sort((a, b) => a - b) }
}

/** The weight the browser falls back to when the exact one isn't loaded (CSS font matching). */
export function renderedWeight(wanted: number, available: number[]): number {
  if (!available.length || available.includes(wanted)) return wanted
  const up = available.filter((w) => w > wanted)
  const down = available.filter((w) => w < wanted).reverse()
  if (wanted >= 400 && wanted <= 500) {
    const upTo500 = up.filter((w) => w <= 500)
    return upTo500[0] ?? down[0] ?? up[0]
  }
  return wanted < 400 ? (down[0] ?? up[0]) : (up[0] ?? down[0])
}
