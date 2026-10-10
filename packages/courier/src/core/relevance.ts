// Which categories an element uses, and which properties would have an effect.

import { CATEGORIES, GROUPS, collapseGroup, type Category } from './properties'
import { baseline, px, readComputed, toHex } from './read'
import { classKey } from './describe'

export const isFlex = (display: string) => display === 'flex' || display === 'inline-flex'
export const isGrid = (display: string) => display === 'grid' || display === 'inline-grid'

export interface Section {
  title?: string
  properties: string[]
}

const INTERACTIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/

const isIcon = (el: Element) => {
  if (!(el instanceof SVGSVGElement || el instanceof HTMLImageElement)) return false
  const r = el.getBoundingClientRect()
  return r.width <= 64 && r.height <= 64
}

/**
 * A direct child that is part of its parent rather than an element of its
 * own: an icon, or an unstyled wrapper around text (the label span in a
 * button). Links, buttons, boxed children and block content are their own
 * elements, so selecting a parent never edits them.
 */
export function isPart(child: Element, depth = 0): boolean {
  if (isIcon(child)) return true
  if (!(child instanceof HTMLElement) || INTERACTIVE.test(child.tagName)) return false
  // A label wrapper may hold smaller parts of its own (the arrow span in
  // "Start Free Trial ->"), two levels deep at most.
  if ([...child.children].some((c) => !(c instanceof SVGElement) && !(depth < 2 && isPart(c, depth + 1)))) return false
  const cs = getComputedStyle(child)
  const parentDisplay = child.parentElement ? getComputedStyle(child.parentElement).display : ''
  // Flex and grid items are blockified, so only their parent tells us they were inline.
  if (!cs.display.startsWith('inline') && !/flex|grid/.test(parentDisplay)) return false
  const box = ['padding-top', 'padding-left', 'border-top-width', 'border-left-width'].some(
    (p) => parseFloat(cs.getPropertyValue(p)) > 0,
  )
  return !box && cs.backgroundColor === 'rgba(0, 0, 0, 0)'
}

/** The element has text of its own, or in a direct child that is one of its parts. */
export function hasOwnText(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) return true
  }
  return [...el.children].some((c) => !(c instanceof SVGElement) && c.textContent?.trim() && isPart(c))
}

const iconKey = (el: Element) => {
  const r = el.getBoundingClientRect()
  return `${el.tagName}|${classKey(el)}|${Math.round(r.width)}x${Math.round(r.height)}`
}

/** The element itself if it is an icon, else its first direct child icon. */
export function findIcon(el: Element): Element | null {
  if (isIcon(el)) return el
  return [...el.children].find(isIcon) ?? null
}

/** Direct child icons of `root` that match `sample` (same tag, classes and size). */
export function matchingIcons(root: Element, sample: Element): Element[] {
  if (root === sample) return [root]
  const key = iconKey(sample)
  return [...root.children].filter((c) => isIcon(c) && iconKey(c) === key)
}

export function hasBorder(el: Element): boolean {
  const cs = getComputedStyle(el)
  return ['top', 'right', 'bottom', 'left'].some(
    (s) => px(cs.getPropertyValue(`border-${s}-width`)) > 0 && cs.getPropertyValue(`border-${s}-style`) !== 'none',
  )
}

/** Categories this element actually uses, in display order. */
export function usedCategories(el: Element): Category[] {
  const cs = getComputedStyle(el)
  const display = cs.display
  const used = new Set<Category>(['Layout'])
  if (display !== 'inline' && display !== 'contents') used.add('Size')
  const anySide = (prefix: string, suffix = '') =>
    ['top', 'right', 'bottom', 'left'].some((s) => px(cs.getPropertyValue(`${prefix}-${s}${suffix}`)) !== 0)
  if (anySide('padding') || anySide('margin')) used.add('Spacing')
  if (['top-left', 'top-right', 'bottom-right', 'bottom-left'].some((c) => px(cs.getPropertyValue(`border-${c}-radius`)) > 0))
    used.add('Shape')
  const bg = toHex(cs.backgroundColor)
  if ((bg && !bg.endsWith('00')) || parseFloat(cs.opacity) < 1) used.add('Fill')
  if (hasBorder(el)) used.add('Border')
  if (hasOwnText(el)) used.add('Text')
  if (findIcon(el)) used.add('Icon')
  return CATEGORIES.filter((c) => used.has(c))
}

/** Properties shown in a category's panel, grouped into sections. */
export function sectionsFor(category: Category, el: Element): Section[] {
  const cs = getComputedStyle(el)
  const display = cs.display
  const flex = isFlex(display)
  const grid = isGrid(display)
  const base = (p: string) => baseline(el, p)
  const group = (name: string) => collapseGroup(GROUPS[name], base)

  switch (category) {
    case 'Layout': {
      const props = ['display']
      if (flex) props.push('flex-direction', 'flex-wrap')
      if (flex || grid) props.push('align-items', 'justify-content', ...gapProperties(el))
      return [{ properties: props }]
    }
    case 'Size': {
      if (display === 'inline' || display === 'contents' || display === 'none') return []
      const props = ['width', 'height']
      for (const p of ['min-width', 'max-width', 'min-height', 'max-height']) {
        const v = base(p)
        if (v !== 'auto' && v !== 'none' && v !== '0px') props.push(p)
      }
      return [{ properties: props }]
    }
    case 'Spacing': {
      let margin = group('margin')
      // Vertical margins do nothing on inline boxes.
      if (display === 'inline') {
        margin = margin.length === 4 ? ['margin-right', 'margin-left'] : ['margin-inline']
      }
      return [
        { title: 'Padding', properties: group('padding') },
        { title: 'Margin', properties: margin },
      ]
    }
    case 'Shape':
      return [{ properties: group('border-radius') }]
    case 'Fill':
      return [{ properties: ['background-color', 'opacity'] }]
    case 'Border':
      return [{ properties: [...group('border-width'), ...group('border-style'), ...group('border-color')] }]
    case 'Text': {
      const props = ['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing']
      // Alignment only matters when the box is wider than its text.
      if (display !== 'inline') props.push('text-align')
      props.push('text-transform')
      return [{ properties: props }]
    }
    case 'Icon': {
      const icon = findIcon(el)
      if (!icon) return []
      const props = ['width', 'height', 'color']
      const stroke = getComputedStyle(icon).stroke
      if (icon instanceof SVGElement && stroke && stroke !== 'none') props.push('stroke-width')
      return [{ properties: props }]
    }
    default:
      return []
  }
}

/**
 * The element's own gap. Collapses to `gap` when both axes match, otherwise
 * only the axes that have an effect (main axis for single line flex).
 */
export function gapProperties(el: Element): string[] {
  const cs = getComputedStyle(el)
  const row = baseline(el, 'row-gap')
  const col = baseline(el, 'column-gap')
  if (row === col) return ['gap']
  if (isFlex(cs.display) && cs.flexWrap === 'nowrap') {
    return [cs.flexDirection.startsWith('column') ? 'row-gap' : 'column-gap']
  }
  return ['row-gap', 'column-gap']
}

/** Flex or grid items: in-flow element children plus loose text, which also becomes an item. */
export function layoutItems(el: Element): number {
  let n = 0
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent!.trim()) n++
    } else if (node instanceof Element) {
      const cs = getComputedStyle(node)
      if (cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed') n++
    }
  }
  return n
}

/** A gap only does something with two or more items to sit between. */
export function gapApplies(el: Element): boolean {
  const d = getComputedStyle(el).display
  return (isFlex(d) || isGrid(d)) && layoutItems(el) > 1
}

/**
 * The wrapper that actually lays out an element's content, when the element
 * has nothing but that one wrapper inside: <a class="btn"><span class="inline-flex
 * items-center">Start <span>-></span></span></a>. Its gap is the space between
 * the label and the arrow, so the element's Gap control edits it.
 */
export function innerLayout(el: Element): Element | null {
  if (layoutItems(el) !== 1) return null
  const child = [...el.children].find((c) => getComputedStyle(c).display !== 'none')
  if (!child || child instanceof SVGElement || !isPart(child)) return null
  return gapApplies(child) ? child : null
}

export function liveValue(el: Element, property: string): string {
  return readComputed(getComputedStyle(el), property)
}
