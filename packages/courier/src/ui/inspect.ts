// Page listeners for inspect mode. All capture phase, so the page never sees
// the clicks used for picking.

import { useEffect } from 'preact/hooks'

const INTERACTIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'])

/** Padding, border or a background: the element draws a box of its own. */
function hasOwnBox(el: Element): boolean {
  const cs = getComputedStyle(el)
  const sides = ['top', 'right', 'bottom', 'left']
  return (
    sides.some((s) => parseFloat(cs.getPropertyValue(`padding-${s}`)) > 0 || parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0) ||
    cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
    cs.backgroundImage !== 'none'
  )
}

/**
 * An unstyled wrapper around text or an icon: inline, or a flex/grid item
 * (which the browser blockifies), with no box of its own and no element
 * children besides icons.
 */
function isPlainWrapper(el: Element): boolean {
  if (INTERACTIVE.has(el.tagName)) return false
  const cs = getComputedStyle(el)
  const parent = el.parentElement
  const parentDisplay = parent ? getComputedStyle(parent).display : ''
  const isItem = /flex|grid/.test(parentDisplay)
  if (cs.display !== 'inline' && !isItem) return false
  const box = ['padding-left', 'padding-right', 'padding-top', 'border-left-width', 'border-top-width'].some(
    (p) => parseFloat(cs.getPropertyValue(p)) > 0,
  )
  if (box || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return false
  return [...el.children].every((c) => c instanceof SVGElement)
}

/**
 * The element a click means. Inside an svg that's the svg itself, and plain
 * inline wrappers (an unstyled label span or icon) resolve to the box around
 * them, so clicking a button's text picks the button.
 */
export function pickTarget(raw: Element): Element | null {
  let el: Element = raw
  let svg = el.closest('svg')
  while (svg?.parentElement?.closest('svg')) svg = svg.parentElement.closest('svg')
  if (svg) el = svg
  while (el.parentElement && el.parentElement !== document.body && isPlainWrapper(el)) el = el.parentElement
  // Inside a link or button, anything without a box of its own (a label span
  // with layout utilities) means the link or button itself.
  const control = el.closest('a, button')
  if (control && control !== el && !hasOwnBox(el)) el = control
  if (el === document.documentElement || el === document.body) return null
  return el
}

// Other dev tools render their own overlays into the page: Next's indicator
// and error overlay (nextjs-portal), Vite's error overlay, Astro's toolbar.
const KNOWN_TOOLS = /^(?:nextjs-portal|vite-error-overlay|astro-dev-toolbar|astro-dev-overlay|vercel-live-feedback|nuxt-devtools|svelte-inspector)/

/**
 * True for another tool's overlay, or anything inside one: a known one, or
 * any custom element with a shadow root mounted straight on <html> or <body>
 * that takes no space itself (how overlays are usually built).
 */
export function isTooling(el: Element, host: Element): boolean {
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n === host || !n.tagName.includes('-')) continue
    if (KNOWN_TOOLS.test(n.tagName.toLowerCase())) return true
    const top = n.parentElement === document.body || n.parentElement === document.documentElement
    if (!top || !n.shadowRoot) continue
    const r = n.getBoundingClientRect()
    if ((r.width === 0 && r.height === 0) || getComputedStyle(n).position === 'fixed') return true
  }
  return false
}

/**
 * Inspect mode. An invisible layer (the shield) covers the page, so the page
 * never sees the pointer: buttons don't switch into their hover state and
 * every reading is the element's normal look (as in Figma, where hover
 * states don't fire while you select). The element under the pointer is
 * found by looking through the layer. Over another tool's overlay the layer
 * steps aside so that tool keeps working.
 *
 * Returns the handlers for the layer itself. They go on as props, so they
 * exist the moment the layer renders; an effect would leave a first quick
 * click landing on a layer that can't respond yet.
 */
export function useInspect(
  active: boolean,
  host: Element,
  shield: { current: HTMLElement | null },
  onHover: (el: Element | null) => void,
  onPick: (el: Element) => void,
) {
  // The page element at a point, looking through Courier's own layer.
  const under = (x: number, y: number) => document.elementsFromPoint(x, y).find((el) => el !== host) ?? null
  const pageTarget = (x: number, y: number) => {
    const el = under(x, y)
    return el && !isTooling(el, host) ? pickTarget(el) : null
  }
  const track = (x: number, y: number) => {
    const layer = shield.current
    const el = under(x, y)
    const tool = !!el && isTooling(el, host)
    if (layer) layer.style.pointerEvents = tool ? 'none' : ''
    onHover(el && !tool ? pickTarget(el) : null)
  }
  // Pointer events on the layer stop here, so page listeners never see them.
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // While the layer steps aside over another tool, the page gets the pointer
  // again; this brings the layer back once the pointer leaves that tool.
  useEffect(() => {
    if (!active) return
    const move = (e: PointerEvent) => {
      const path = e.composedPath()
      if (path.includes(host)) {
        // Over Courier's own panel or toolbar: nothing on the page to highlight.
        if (path[0] !== shield.current) onHover(null)
        return
      }
      track(e.clientX, e.clientY)
    }
    const leave = () => onHover(null)
    window.addEventListener('pointermove', move, true)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move, true)
      document.documentElement.removeEventListener('pointerleave', leave)
      if (shield.current) shield.current.style.pointerEvents = ''
      onHover(null)
    }
  }, [active, host])

  return {
    onPointerMove: (e: PointerEvent) => track(e.clientX, e.clientY),
    onPointerDown: (e: PointerEvent) => {
      swallow(e)
      onHover(pageTarget(e.clientX, e.clientY))
    },
    onClick: (e: MouseEvent) => {
      swallow(e)
      const el = pageTarget(e.clientX, e.clientY)
      if (el) onPick(el)
    },
    onMouseDown: swallow,
    onPointerUp: swallow,
    onMouseUp: swallow,
    onDblClick: swallow,
    onAuxClick: swallow,
    onContextMenu: swallow,
  }
}
