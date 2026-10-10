// Binds the UI to the core for the current selection: resolves who a change
// is set on (owner and scope) and reads current and before values.

import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import {
  ATTR,
  baseline,
  isAttr,
  changeKey,
  findIcon,
  innerLayout,
  matchingIcons,
  readComputed,
  originalSizeMode,
  sizeBefore,
  sizeModeValues,
  sizeProperties,
  type Change,
  type ChangeStore,
  type Owner,
  type Scope,
  type SizeAxis,
  type SizeMode,
} from '../core'

export interface Editor {
  el: Element
  scope: Scope
  matches: Element[]
  store: ChangeStore
  /** Icons edited by the Icon section: every matching icon in the selection. */
  icons: Element[]
  /** The element whose value a field shows for this owner. */
  primary(owner: Owner): Element | null
  value(property: string, owner?: Owner): string
  before(property: string, owner?: Owner): string
  changed(property: string, owner?: Owner): Change | undefined
  set(property: string, owner: Owner, value: string, coalesce?: boolean): void
  /** Several properties as one undo step. */
  setMany(values: Record<string, string>, owner?: Owner, coalesce?: boolean): void
  reset(property: string, owner?: Owner): void
  resetMany(properties: string[], owner?: Owner): void
  setSize(axis: SizeAxis, mode: SizeMode, fixed?: string, coalesce?: boolean): void
}

export function createEditor(store: ChangeStore, el: Element, matches: Element[], scope: Scope): Editor {
  const icon = findIcon(el)
  const anchors = scope === 'all' ? matches : [el]
  // The same icon in every anchor: in a matching sibling, find icons that
  // match the sample found in the selected element.
  const iconsIn = (anchor: Element) => (icon ? matchingIcons(anchor, anchor === el ? icon : findIcon(anchor) ?? icon) : [])
  const icons = icon ? matchingIcons(el, icon) : []
  // The wrapper laying out the content (a button's label span); followed by
  // position into each matching element.
  const inner = innerLayout(el)
  const innerPath = inner ? [...el.children].indexOf(inner) : -1
  const innerIn = (anchor: Element) => (innerPath >= 0 ? anchor.children[innerPath] ?? null : null)

  const primary = (owner: Owner): Element | null =>
    owner === 'parent' ? el.parentElement : owner === 'icon' ? icon : owner === 'inner' ? inner : el
  // All matching edits are keyed to the group, not to whichever member was
  // selected, so editing the group from X and then from GitHub updates one change.
  const anchorFor = (owner: Owner) => (owner === 'parent' ? el.parentElement! : scope === 'all' ? matches[0] : el)

  const editor: Editor = {
    el,
    scope,
    matches,
    store,
    icons,
    primary,
    value(property, owner = 'self') {
      const t = primary(owner)
      if (!t) return ''
      const winner = store
        .list()
        .filter((c) => c.property === property && c.targets.includes(t))
        .pop()
      return winner?.after ?? readComputed(getComputedStyle(t), property)
    },
    before(property, owner = 'self') {
      const t = primary(owner)
      return t ? baseline(t, property) : ''
    },
    changed(property, owner = 'self') {
      return store.get(changeKey(anchorFor(owner), scope, owner, property))
    },
    set(property, owner, value, coalesce = false) {
      const t = primary(owner)
      if (!t) return
      let targets: Element[]
      let members: Element[]
      if (owner === 'parent') {
        targets = [t]
        members = [...t.children]
      } else if (owner === 'icon') {
        members = anchors
        targets = anchors.flatMap(iconsIn)
      } else if (owner === 'inner') {
        members = anchors
        targets = anchors.map(innerIn).filter((x): x is Element => !!x)
      } else {
        targets = members = anchors
      }
      const isSize = owner === 'self' && (property === 'width' || property === 'height')
      const before = isAttr(property)
        ? (t.getAttribute(property.slice(ATTR.length)) ?? 'none')
        : isSize
          ? sizeBefore(t, property)
          : baseline(t, property)
      const input = { anchor: anchorFor(owner), scope, owner, property, targets, members, before, value }
      // An all matching edit supersedes single element edits of the same
      // property on its members; keeping both would export a contradiction.
      const stale =
        scope === 'all' && owner !== 'parent'
          ? matches.map((m) => changeKey(m, 'this', owner, property)).filter((k) => store.get(k))
          : []
      if (!stale.length) return store.set(input, { coalesce })
      store.batch(() => {
        stale.forEach((k) => store.reset(k))
        store.set(input)
      })
    },
    setMany(values, owner = 'self', coalesce = false) {
      store.batch(
        () => {
          for (const [p, v] of Object.entries(values)) editor.set(p, owner, v)
        },
        { coalesce },
      )
    },
    reset(property, owner = 'self') {
      store.reset(changeKey(anchorFor(owner), scope, owner, property))
    },
    resetMany(properties, owner = 'self') {
      store.batch(() => properties.forEach((p) => editor.reset(p, owner)))
    },
    setSize(axis, mode, fixed, coalesce = false) {
      // Going back to the original mode removes the edit instead of restating it.
      const values = mode === originalSizeMode(el, axis) && mode !== 'fixed' ? {} : sizeModeValues(el, axis, mode, fixed)
      // Mode properties not used by the new mode go back to their before value.
      for (const p of sizeProperties(el, axis)) {
        if (!(p in values)) values[p] = p === axis ? sizeBefore(el, axis) : baseline(el, p)
      }
      // Typing into a fixed size only touches that one property, so it can coalesce.
      const only = Object.keys(values).filter((p) => values[p] !== editor.value(p))
      if (coalesce && only.length === 1) return editor.set(only[0], 'self', values[only[0]], true)
      editor.setMany(values)
    },
  }
  return editor
}

export const EditorContext = createContext<Editor | null>(null)
export const useEditor = () => useContext(EditorContext)!
