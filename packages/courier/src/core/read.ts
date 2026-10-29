// Reading computed values and normalizing them for display and export.

import { PROPERTY_CATEGORY, READ_THROUGH } from './properties'

const COLOR_PROPS = /(^|-)color$/

export function isColorProperty(property: string): boolean {
  return COLOR_PROPS.test(property)
}

/** Read one property from computed style, normalized (hex colors, rounded lengths). */
export function readComputed(cs: CSSStyleDeclaration, property: string): string {
  const raw = cs.getPropertyValue(READ_THROUGH[property] ?? property).trim()
  return normalize(property, raw)
}

const GAPS = new Set(['gap', 'row-gap', 'column-gap'])

export function normalize(property: string, raw: string): string {
  if (isColorProperty(property)) return toHex(raw) ?? raw
  // Courier only shows gaps on flex and grid boxes, where "normal" is 0.
  if (GAPS.has(property) && raw === 'normal') return '0px'
  // One layer format for computed and edited shadows, so before and after compare.
  if (property === 'box-shadow') return formatShadows(parseShadows(raw))
  return roundLengths(raw)
}

/** "33.59375px" to "33.59px". Leaves keywords and other tokens alone. */
export function roundLengths(value: string): string {
  return value.replace(/-?\d*\.\d+(?=[a-z%]*\b)/gi, (n) => String(Math.round(parseFloat(n) * 100) / 100))
}

// Colors

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

export function rgbaToHex(r: number, g: number, b: number, a = 1): string {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`
  return (a >= 1 ? base : base + hex2(a * 255)).toUpperCase()
}

/** Convert any computed CSS color to #RRGGBB or #RRGGBBAA. */
export function toHex(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (v === 'transparent') return '#00000000'
  if (/^#[0-9a-f]{3,8}$/.test(v)) return expandHex(v)
  const m = v.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    const [r, g, b] = parts.slice(0, 3).map(Number)
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : Number(parts[3])
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
    return rgbaToHex(r, g, b, a)
  }
  return canvasToHex(value)
}

function expandHex(v: string): string {
  if (v.length === 4 || v.length === 5) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (v.length === 9 && v.endsWith('ff')) v = v.slice(0, 7)
  return v.toUpperCase()
}

let ctx: CanvasRenderingContext2D | null | undefined
// Modern color syntaxes (oklch, color()) may come back from getComputedStyle
// unconverted. Painting one pixel gives us sRGB.
function canvasToHex(value: string): string | null {
  if (ctx === undefined) {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      ctx = c.getContext('2d', { willReadFrequently: true })
    } catch {
      ctx = null
    }
  }
  if (!ctx) return null
  try {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return rgbaToHex(r, g, b, a / 255)
  } catch {
    return null
  }
}

// Lengths

export interface ParsedLength {
  num: number
  unit: string
}

export function parseLength(value: string): ParsedLength | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i)
  return m ? { num: parseFloat(m[1]), unit: m[2].toLowerCase() } : null
}

export const px = (value: string) => parseFloat(value) || 0

// Shadows

/** One box-shadow layer, like one drop or inner shadow in Figma's effects. */
export interface ShadowLayer {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  /** #RRGGBB or #RRGGBBAA */
  color: string
}

/** Split on separators outside parentheses, so rgba(0, 0, 0, 0.3) stays whole. */
function splitTop(value: string, sep: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let part = ''
  for (const ch of value) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth === 0 && sep.test(ch)) {
      if (part.trim()) out.push(part.trim())
      part = ''
    } else part += ch
  }
  if (part.trim()) out.push(part.trim())
  return out
}

/**
 * Layers of a box-shadow value, in either order browsers and authors write
 * them: "rgba(0, 0, 0, 0.3) 0px 2px 8px 0px inset" or "inset 0 2px 8px #000".
 * Missing blur and spread are 0, a missing color is the text color's black.
 */
export function parseShadows(value: string): ShadowLayer[] {
  const v = value.trim()
  if (!v || v === 'none') return []
  return splitTop(v, /,/).map((layer) => {
    let inset = false
    const lengths: number[] = []
    const color: string[] = []
    for (const token of splitTop(layer, /\s/)) {
      const n = parseLength(token)
      if (token === 'inset') inset = true
      else if (n && (n.unit === 'px' || n.num === 0)) lengths.push(n.num)
      else color.push(token)
    }
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths
    return { inset, x, y, blur, spread, color: toHex(color.join(' ') || '#000') ?? '#000000' }
  })
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Back to CSS, every length written out: "0px 4px 4px 0px #00000040". */
export function formatShadows(layers: ShadowLayer[]): string {
  if (!layers.length) return 'none'
  return layers
    .map((l) => `${l.inset ? 'inset ' : ''}${r2(l.x)}px ${r2(l.y)}px ${r2(l.blur)}px ${r2(l.spread)}px ${l.color}`)
    .join(', ')
}

// Baselines: the computed values an element had before Courier touched it.
// Captured once, before the first override, and dropped when the element is
// fully restored. "Before" values and matching always come from here.

const baselines = new WeakMap<Element, Map<string, string>>()
const TRACKED = [...Object.keys(PROPERTY_CATEGORY), 'stroke-width']

export function captureBaseline(el: Element): void {
  if (baselines.has(el)) return
  const cs = getComputedStyle(el)
  const map = new Map<string, string>()
  for (const p of TRACKED) map.set(p, readComputed(cs, p))
  baselines.set(el, map)
}

export function baseline(el: Element, property: string): string {
  captureBaseline(el)
  const map = baselines.get(el)!
  if (!map.has(property)) map.set(property, readComputed(getComputedStyle(el), property))
  return map.get(property)!
}

export function dropBaseline(el: Element): void {
  baselines.delete(el)
}
