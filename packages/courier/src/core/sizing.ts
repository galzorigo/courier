// Fixed, Hug and Fill sizing, the way Framer and Figma describe it, mapped to
// the CSS that produces each one for the element's actual parent layout.

import { isFlex } from './relevance'
import { baseline } from './read'
import { withStyles } from './units'

export type SizeMode = 'fixed' | 'hug' | 'fill'
export type SizeAxis = 'width' | 'height'

export interface SizeInfo {
  mode: SizeMode
  /** Rendered size in px. */
  px: number
  /** Parent is flex and this axis is its main axis (Fill means grow). */
  flexMain: boolean
  /** Parent is flex and this axis is its cross axis (Fill means stretch). */
  flexCross: boolean
  /** Fill would change something: false when the parent has no set size on this axis. */
  canFill: boolean
}

function context(el: Element, axis: SizeAxis) {
  const parent = el.parentElement
  const pcs = parent ? getComputedStyle(parent) : null
  const flex = !!pcs && isFlex(pcs.display)
  const row = !!pcs && pcs.flexDirection.startsWith('row')
  const flexMain = flex && (axis === 'width') === row
  return { flexMain, flexCross: flex && !flexMain }
}

const size = (el: Element, axis: SizeAxis) => {
  const r = el.getBoundingClientRect()
  return axis === 'width' ? r.width : r.height
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.5

/** The props that make up a size mode, so switching modes can clean up after itself. */
export function sizeProperties(el: Element, axis: SizeAxis): string[] {
  const { flexMain, flexCross } = context(el, axis)
  return [axis, ...(flexMain ? ['flex-grow', 'flex-basis'] : []), ...(flexCross ? ['align-self'] : [])]
}

export function sizeInfo(el: Element, axis: SizeAxis): SizeInfo {
  const { flexMain, flexCross } = context(el, axis)
  const cs = getComputedStyle(el)
  const px = size(el, axis)
  let canFill = true
  const result = (mode: SizeMode): SizeInfo => ({ mode, px: Math.round(px * 100) / 100, flexMain, flexCross, canFill })

  if (flexMain && parseFloat(cs.flexGrow) > 0) return result('fill')
  const hug = withStyles(el, { [axis]: 'fit-content', 'flex-grow': '0', 'flex-basis': 'auto' }, () => size(el, axis))
  const fill = flexMain
    ? null
    : withStyles(el, flexCross ? { [axis]: 'auto', 'align-self': 'stretch' } : { [axis]: '100%' }, () => size(el, axis))
  const isHug = close(px, hug)
  const isFill = fill !== null && close(px, fill)
  // 100% of a parent sized by its content resolves to the content size.
  if (fill !== null && close(fill, hug) && !isFill) canFill = false
  if (fill !== null && close(fill, hug) && axis === 'height') canFill = false
  if (isFill && !isHug) return result('fill')
  if (isHug && !isFill) return result('hug')
  if (isHug && isFill) {
    // Content exactly fills the parent. Block boxes in normal flow fill by
    // default; everything else (and heights) hugs.
    const blockFlow = !flexCross && axis === 'width' && cs.display === 'block' && !/flex|grid/.test(getComputedStyle(el.parentElement!).display)
    return result(blockFlow ? 'fill' : 'hug')
  }
  return result('fixed')
}

/**
 * Property values for a mode. Properties of the mode group that aren't
 * listed should go back to their before value.
 */
export function sizeModeValues(el: Element, axis: SizeAxis, mode: SizeMode, fixed?: string): Record<string, string> {
  const info = sizeInfo(el, axis)
  const out: Record<string, string> = {}
  const stopGrowing = () => {
    if (!info.flexMain) return
    if (parseFloat(baseline(el, 'flex-grow')) > 0) out['flex-grow'] = '0'
    if (baseline(el, 'flex-basis') !== 'auto') out['flex-basis'] = 'auto'
  }
  if (mode === 'fixed') {
    out[axis] = fixed ?? `${Math.round(info.px)}px`
    stopGrowing()
  } else if (mode === 'hug') {
    out[axis] = 'fit-content'
    stopGrowing()
  } else if (info.flexMain) {
    out['flex-grow'] = '1'
    out['flex-basis'] = '0%'
  } else if (info.flexCross) {
    out['align-self'] = 'stretch'
    out[axis] = 'auto'
  } else {
    out[axis] = '100%'
  }
  return out
}

/**
 * The before value for width or height, describing how the element was
 * sized, not just its pixels. A hugging chip that becomes Fixed at the same
 * 56px is still a real change ("auto (hugs content, 56px) → 56px"), where a
 * plain pixel before value would equal the after value and vanish.
 */
const sizeBefores = new WeakMap<Element, Partial<Record<SizeAxis, string>>>()

export function sizeBefore(el: Element, axis: SizeAxis): string {
  const cached = sizeBefores.get(el)?.[axis]
  if (cached) return cached
  const info = sizeInfo(el, axis)
  const px = `${Math.round(info.px * 100) / 100}px`
  const value =
    info.mode === 'fixed' ? baseline(el, axis) : `auto (${info.mode === 'hug' ? 'hugs content' : 'fills parent'}, ${px})`
  sizeBefores.set(el, { ...sizeBefores.get(el), [axis]: value })
  return value
}

/** The mode the element had before any edit, read from its before value. */
export function originalSizeMode(el: Element, axis: SizeAxis): SizeMode {
  const before = sizeBefore(el, axis)
  return before.startsWith('auto (hugs') ? 'hug' : before.startsWith('auto (fills') ? 'fill' : 'fixed'
}

/** Record before values while the element is still untouched (fresh drops old ones). */
export function rememberSizeBefore(el: Element, fresh = false): void {
  if (fresh) sizeBefores.delete(el)
  sizeBefore(el, 'width')
  sizeBefore(el, 'height')
}
