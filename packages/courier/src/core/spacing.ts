// "Gap between siblings": measure the real distance to a neighbour, then work
// out which property produces it.

import { isFlex, isGrid } from './relevance'
import { px } from './read'

export type SpacingSource =
  | { kind: 'parent-gap'; parent: Element; property: 'gap' | 'row-gap' | 'column-gap'; count: number }
  | { kind: 'margin'; owner: 'self'; property: string }
  | { kind: 'margin'; owner: 'sibling'; sibling: Element; property: string }
  | { kind: 'space-distribution'; parent: Element; justify: string }
  | { kind: 'mixed'; parts: string[] }
  | { kind: 'unknown' }

export interface SiblingSpacing {
  /** Measured distance in px between the element and its neighbour. */
  distance: number
  axis: 'x' | 'y'
  neighbour: Element
  source: SpacingSource
}

const TOLERANCE = 1

function inFlow(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.display === 'contents') return false
  if (cs.position === 'absolute' || cs.position === 'fixed') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 || r.height > 0
}

export function measureSiblingSpacing(el: Element): SiblingSpacing | null {
  const parent = el.parentElement
  if (!parent || !inFlow(el)) return null
  const siblings = [...parent.children].filter(inFlow)
  const i = siblings.indexOf(el)
  const next = siblings[i + 1]
  const prev = siblings[i - 1]
  const neighbour = next ?? prev
  if (!neighbour) return null
  // Always measure first then second in DOM order.
  const [a, b] = next ? [el, next] : [prev, el]
  const ra = a.getBoundingClientRect()
  const rb = b.getBoundingClientRect()

  const pcs = getComputedStyle(parent)
  const flex = isFlex(pcs.display)
  const grid = isGrid(pcs.display)
  let axis: 'x' | 'y'
  if (flex) axis = pcs.flexDirection.startsWith('row') ? 'x' : 'y'
  else if (grid) axis = Math.abs(ra.top - rb.top) < Math.min(ra.height, rb.height) / 2 ? 'x' : 'y'
  else axis = 'y'

  const reversed = flex && pcs.flexDirection.endsWith('reverse')
  const distance =
    axis === 'x'
      ? reversed ? ra.left - rb.right : rb.left - ra.right
      : reversed ? ra.top - rb.bottom : rb.top - ra.bottom
  const rounded = Math.round(distance * 100) / 100
  const result = (source: SpacingSource): SiblingSpacing => ({ distance: rounded, axis, neighbour, source })

  const acs = getComputedStyle(a)
  const bcs = getComputedStyle(b)
  const [endA, startB] =
    axis === 'x'
      ? reversed ? ['margin-left', 'margin-right'] : ['margin-right', 'margin-left']
      : reversed ? ['margin-top', 'margin-bottom'] : ['margin-bottom', 'margin-top']
  const mA = px(acs.getPropertyValue(endA))
  const mB = px(bcs.getPropertyValue(startB))
  // The margin that sits in the gap on the selected element's side.
  const own = a === el ? { value: mA, property: endA } : { value: mB, property: startB }
  const other = a === el ? { value: mB, property: startB, el: b } : { value: mA, property: endA, el: a }

  const marginSource = (): SpacingSource =>
    own.value !== 0
      ? { kind: 'margin', owner: 'self', property: own.property }
      : { kind: 'margin', owner: 'sibling', sibling: other.el, property: other.property }

  if (flex || grid) {
    const gapProp = axis === 'x' ? 'column-gap' : 'row-gap'
    const gap = px(pcs.getPropertyValue(gapProp))
    const margins = mA + mB
    const count = siblings.length
    if (Math.abs(distance - (gap + margins)) <= TOLERANCE) {
      if (gap > 0 && margins === 0) {
        const property = pcs.rowGap === pcs.columnGap ? 'gap' : gapProp
        return result({ kind: 'parent-gap', parent, property, count })
      }
      if (gap === 0 && margins !== 0) {
        if (mA !== 0 && mB !== 0) return result({ kind: 'mixed', parts: [`${endA} ${mA}px`, `${startB} ${mB}px`] })
        return result(marginSource())
      }
      if (gap > 0 && margins !== 0) {
        return result({ kind: 'mixed', parts: [`parent ${gapProp} ${gap}px`, `margins ${margins}px`] })
      }
    }
    if (flex && /space-(between|around|evenly)/.test(pcs.justifyContent) && distance > gap + margins + TOLERANCE) {
      return result({ kind: 'space-distribution', parent, justify: pcs.justifyContent })
    }
    return result({ kind: 'unknown' })
  }

  // Block flow, touching: there is no gap yet, and a margin on this element is how to add one.
  if (axis === 'y' && mA === 0 && mB === 0 && Math.abs(distance) <= TOLERANCE) {
    return result({ kind: 'margin', owner: 'self', property: own.property })
  }
  // Block flow: vertical margins collapse to the larger one.
  if (axis === 'y' && mA >= 0 && mB >= 0) {
    const collapsed = Math.max(mA, mB)
    if (collapsed > 0 && Math.abs(distance - collapsed) <= TOLERANCE) {
      if (own.value === collapsed) return result({ kind: 'margin', owner: 'self', property: own.property })
      return result({ kind: 'margin', owner: 'sibling', sibling: other.el, property: other.property })
    }
  }
  return result({ kind: 'unknown' })
}
