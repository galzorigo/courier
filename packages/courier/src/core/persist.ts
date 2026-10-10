// Keeping pending changes across page reloads. Elements are stored by their
// position in the document plus tag and classes, and found again after the
// reload. A change whose element can't be found is reported, not guessed at.

import type { ChangeStore, LoadedChange, Owner, Scope } from './changes'
import { classKey, selectorPath } from './describe'

export interface StoredRef {
  /** Child indexes from <html> down. */
  path: number[]
  tag: string
  classes: string
  /** Fallback when the path no longer lands on the same kind of element. */
  selector: string
}

export interface StoredChange {
  scope: Scope
  owner: Owner
  property: string
  before: string
  after: string
  saved: boolean
  anchor: StoredRef
  targets: StoredRef[]
  members: StoredRef[]
}


// The last known ref for each element, so one removed from the page (route
// change, conditional render) can still be stored as it was.
const lastRef = new WeakMap<Element, StoredRef>()

export function refOf(el: Element): StoredRef {
  if (!el.isConnected) return lastRef.get(el) ?? { path: [], tag: el.tagName, classes: classKey(el), selector: '' }
  const path: number[] = []
  let n: Element = el
  while (n.parentElement) {
    path.unshift([...n.parentElement.children].indexOf(n))
    n = n.parentElement
  }
  const ref = { path, tag: el.tagName, classes: classKey(el), selector: selectorPath(el) }
  lastRef.set(el, ref)
  return ref
}

const same = (el: Element | null | undefined, ref: StoredRef): el is Element =>
  !!el && el.tagName === ref.tag && classKey(el) === ref.classes

export function resolve(ref: StoredRef): Element | null {
  let n: Element | undefined = document.documentElement
  for (const i of ref.path) n = n?.children[i]
  if (same(n, ref)) return n
  if (!ref.selector) return null
  try {
    const found = document.querySelectorAll(ref.selector)
    return found.length === 1 && same(found[0], ref) ? found[0] : null
  } catch {
    return null
  }
}

export function snapshot(store: ChangeStore): StoredChange[] {
  return store.list().map((c) => ({
    scope: c.scope,
    owner: c.owner,
    property: c.property,
    before: c.before,
    after: c.after,
    saved: store.isSaved(c.key),
    anchor: refOf(c.anchor),
    targets: c.targets.map(refOf),
    members: c.members.map(refOf),
  }))
}

/**
 * Put stored changes back. Returns the ones whose elements aren't on the page
 * (yet), so the caller can retry once the app has rendered.
 */
export function restoreInto(store: ChangeStore, items: StoredChange[]): StoredChange[] {
  const missing: StoredChange[] = []
  const loaded: LoadedChange[] = []
  for (const item of items) {
    const anchor = resolve(item.anchor)
    const targets = item.targets.map(resolve)
    const members = item.members.map(resolve)
    if (!anchor || targets.some((t) => !t) || members.some((m) => !m)) {
      missing.push(item)
      continue
    }
    loaded.push({
      anchor,
      scope: item.scope,
      owner: item.owner,
      property: item.property,
      before: item.before,
      after: item.after,
      saved: item.saved,
      targets: targets as Element[],
      members: members as Element[],
    })
  }
  if (loaded.length) store.load(loaded)
  return missing
}

const storageKey = () => `courier:${location.pathname}`

export function readStored(): StoredChange[] {
  try {
    const raw = sessionStorage.getItem(storageKey())
    return raw ? (JSON.parse(raw) as StoredChange[]) : []
  } catch {
    return []
  }
}

export function writeStored(items: StoredChange[]): void {
  try {
    if (items.length) sessionStorage.setItem(storageKey(), JSON.stringify(items))
    else sessionStorage.removeItem(storageKey())
  } catch {
    // Storage blocked or full: changes still work, they just won't survive a reload.
  }
}
