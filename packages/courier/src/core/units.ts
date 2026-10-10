// Validation and unit conversion for typed values.

import { READ_THROUGH } from './properties'
import { parseLength, type ParsedLength } from './read'

export function isValid(property: string, value: string): boolean {
  if (!value.trim()) return false
  try {
    return CSS.supports(property, value)
  } catch {
    return false
  }
}

/**
 * Briefly apply inline styles, run `fn`, then restore the exact original
 * style attribute. Used for measuring without leaving a trace.
 */
export function withStyles<T>(el: Element, styles: Record<string, string>, fn: () => T): T {
  const style = (el as HTMLElement).style
  const hadStyle = el.hasAttribute('style')
  const saved = style.cssText
  try {
    for (const [p, v] of Object.entries(styles)) style.setProperty(p, v, 'important')
    return fn()
  } finally {
    style.cssText = saved
    if (!hadStyle) el.removeAttribute('style')
  }
}

/**
 * How many px one `unit` resolves to for this property on this element.
 * Measured by briefly applying `100<unit>` and reading it back, so %, em and
 * rem resolve against the real containing block and font sizes.
 */
export function pxPerUnit(el: Element, property: string, unit: string): number | null {
  if (unit === 'px') return 1
  if (!(el as HTMLElement).style) return null
  const read = withStyles(el, { [property]: `100${unit}` }, () =>
    getComputedStyle(el).getPropertyValue(READ_THROUGH[property] ?? property),
  )
  const parsed = parseLength(read)
  return parsed && parsed.unit === 'px' ? parsed.num / 100 : null
}

/** Convert a length to another unit, keeping its rendered size. */
export function convertLength(el: Element, property: string, from: ParsedLength, toUnit: string): number {
  if (from.unit === toUnit) return from.num
  const a = pxPerUnit(el, property, from.unit)
  const b = pxPerUnit(el, property, toUnit)
  if (!a || !b) return from.num
  return Math.round(((from.num * a) / b) * 100) / 100
}
