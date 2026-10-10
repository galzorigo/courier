// Scope detection: which elements "match" the selected one.
// Same tag, same class list, same computed styles (sizes excluded, since
// text length legitimately changes them). Matches are siblings, or, when the
// element sits inside a repeated container (a card in a list), the same
// element inside every copy of that container.

import { PROPERTY_CATEGORY } from './properties'
import { baseline } from './read'
import { classKey } from './describe'

/** How far up to look for a repeated container. */
const MAX_DEPTH = 4

const SIGNATURE_PROPS = Object.keys(PROPERTY_CATEGORY).filter((p) => PROPERTY_CATEGORY[p] !== 'Size')


function signature(el: Element): string {
  return SIGNATURE_PROPS.map((p) => baseline(el, p)).join('|')
}

const sameKind = (a: Element, b: Element) => a.tagName === b.tagName && classKey(a) === classKey(b)

/** Matching elements, including the element itself, in document order. */
export function findMatches(el: Element): Element[] {
  const parent = el.parentElement
  if (!parent) return [el]
  const sig = signature(el)
  const like = (c: Element) => c === el || (sameKind(c, el) && signature(c) === sig)

  const siblings = [...parent.children].filter(like)
  if (siblings.length > 1) return siblings

  // Climb to the nearest ancestor that repeats among its own siblings, then
  // follow the same path down inside each copy.
  const path: { kind: Element; index: number }[] = []
  let node: Element = el
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const up = node.parentElement
    if (!up || up === document.body) break
    const same = [...up.children].filter((c) => sameKind(c, node))
    path.unshift({ kind: node, index: same.indexOf(node) })
    const container = up
    const copies = container.parentElement ? [...container.parentElement.children].filter((c) => sameKind(c, container)) : []
    if (copies.length > 1) {
      const found = copies
        .map((copy) => walk(copy, path))
        .filter((m): m is Element => !!m && like(m))
      return found.length > 1 ? found : [el]
    }
    node = up
  }
  return [el]
}

function walk(root: Element, path: { kind: Element; index: number }[]): Element | null {
  let n: Element | undefined = root
  for (const step of path) {
    n = n ? [...n.children].filter((c) => sameKind(c, step.kind))[step.index] : undefined
  }
  return n ?? null
}
