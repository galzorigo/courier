// Pending changes, applied as inline style overrides and tracked in memory.
// Nothing is ever written to source files.

import { categorize, type Category } from './properties'
import { captureBaseline, dropBaseline } from './read'

export type Scope = 'this' | 'all'

/**
 * Who a change is set on.
 * - self: the selected element (or all matching, by scope)
 * - icon: the icon inside the selected element(s)
 * - parent: the parent, when it owns the spacing between siblings
 */
export type Owner = 'self' | 'icon' | 'parent' | 'inner'

export interface Change {
  key: string
  seq: number
  /** The selected element the change was made from (the parent for owner "parent"). */
  anchor: Element
  scope: Scope
  owner: Owner
  property: string
  category: Category
  /** Elements that get the inline style. */
  targets: Element[]
  /** Elements the change is counted against for badges. */
  members: Element[]
  before: string
  after: string
}

export interface ChangeInput {
  anchor: Element
  scope: Scope
  owner: Owner
  property: string
  targets: Element[]
  members: Element[]
  before: string
  value: string
}

/** A change coming back from storage after a reload. */
export interface LoadedChange {
  anchor: Element
  scope: Scope
  owner: Owner
  property: string
  targets: Element[]
  members: Element[]
  before: string
  after: string
  saved: boolean
}

interface HistoryStep {
  key: string
  prev: Change | undefined
  next: Change | undefined
  at: number
  /** Made by a continuous edit (typing, nudging) that later edits may join. */
  coalesce: boolean
}

const COALESCE_MS = 700

let ids = 0
const elementIds = new WeakMap<Element, number>()
export function elementId(el: Element): number {
  let id = elementIds.get(el)
  if (id === undefined) elementIds.set(el, (id = ++ids))
  return id
}

export function changeKey(anchor: Element, scope: Scope, owner: Owner, property: string): string {
  return `${elementId(anchor)}|${owner === 'parent' ? 'this' : scope}|${owner}|${property}`
}

/**
 * What an element's inline style held, per longhand, before Courier touched
 * that longhand. Only properties Courier edits are recorded and restored, so
 * styles the page sets itself (React state, animations) are left alone.
 */
interface InlineSnapshot {
  hadStyle: boolean
  props: Map<string, { value: string; priority: string }>
}

const longhandCache = new Map<string, string[]>()

/** The longhands a property writes ("padding" writes four). */
/**
 * Most changes are CSS properties. A few fixes need an attribute instead
 * (an SVG without a viewBox can't scale), written as "attr:<name>".
 */
export const ATTR = 'attr:'
export const isAttr = (property: string) => property.startsWith(ATTR)

function longhands(property: string): string[] {
  if (isAttr(property)) return [property]
  let list = longhandCache.get(property)
  if (!list) {
    const probe = document.createElement('div').style
    probe.setProperty(property, 'initial')
    list = Array.from({ length: probe.length }, (_, i) => probe.item(i))
    if (!list.length) list = [property]
    longhandCache.set(property, list)
  }
  return list
}

export class ChangeStore {
  private changes = new Map<string, Change>()
  private seq = 0
  private undoStack: HistoryStep[][] = []
  private redoStack: HistoryStep[][] = []
  private originals = new Map<Element, InlineSnapshot>()
  /** Changes as of the last save. Cancel goes back here. */
  private saved = new Map<string, Change>()
  /** Steps collected by batch(), recorded as one undo entry. */
  private batching: HistoryStep[] | null = null
  /** What the last emitted update was, so the UI can follow undo and redo. */
  lastOp: 'edit' | 'undo' | 'redo' = 'edit'
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(op: 'edit' | 'undo' | 'redo' = 'edit') {
    this.lastOp = op
    for (const fn of this.listeners) fn()
  }

  list(): Change[] {
    return [...this.changes.values()].sort((a, b) => a.seq - b.seq)
  }

  get size(): number {
    return this.changes.size
  }

  get(key: string): Change | undefined {
    return this.changes.get(key)
  }

  /** Changes that count against this element, for its badges. */
  forElement(el: Element): Change[] {
    return this.list().filter((c) => c.members.includes(el))
  }

  countByCategory(el?: Element): Map<Category, number> {
    const counts = new Map<Category, number>()
    for (const c of el ? this.forElement(el) : this.list()) {
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
    }
    return counts
  }

  /**
   * Set a value. Setting it back to its before value removes the change.
   * Rapid edits to the same field coalesce into one undo step.
   */
  set(input: ChangeInput, opts: { coalesce?: boolean } = {}): void {
    const key = changeKey(input.anchor, input.scope, input.owner, input.property)
    const prev = this.changes.get(key)
    // The before value is fixed when a change starts. Reading it again later
    // would see Courier's own edit (an attribute it already set) as original.
    const before = prev?.before ?? input.before
    const next: Change | undefined =
      input.value === before
        ? undefined
        : {
            key,
            seq: ++this.seq,
            anchor: input.anchor,
            scope: input.owner === 'parent' ? 'this' : input.scope,
            owner: input.owner,
            property: input.property,
            category: input.owner === 'icon' ? 'Icon' : categorize(input.property),
            targets: input.targets,
            members: input.members,
            before,
            after: input.value,
          }
    if (!prev && !next) return
    const now = Date.now()
    if (this.batching) {
      const same = this.batching.find((s) => s.key === key)
      if (same) same.next = next
      else this.batching.push({ key, prev, next, at: now, coalesce: false })
      this.write(key, next, prev)
      return
    }
    const last = this.undoStack[this.undoStack.length - 1]
    const joins = opts.coalesce && last?.length === 1 && last[0].coalesce && last[0].key === key
    if (joins && now - last[0].at < COALESCE_MS) {
      last[0].next = next
      last[0].at = now
    } else {
      this.undoStack.push([{ key, prev, next, at: now, coalesce: !!opts.coalesce }])
    }
    this.redoStack = []
    this.write(key, next, prev)
    this.emit()
  }

  /** Per field reset: drop one change (undoable). */
  reset(key: string): void {
    const prev = this.changes.get(key)
    if (!prev) return
    const step = { key, prev, next: undefined, at: Date.now(), coalesce: false }
    this.write(key, undefined, prev)
    if (this.batching) return void this.batching.push(step)
    this.undoStack.push([step])
    this.redoStack = []
    this.emit()
  }

  /**
   * Run several edits as one undo step (a size mode touches up to four
   * properties). With coalesce, a quick repeat on the same properties
   * (typing into linked fields) joins the previous step.
   */
  batch(fn: () => void, opts: { coalesce?: boolean } = {}): void {
    if (this.batching) return fn()
    this.batching = []
    try {
      fn()
    } finally {
      const steps = this.batching
      this.batching = null
      if (steps.length) {
        const last = this.undoStack[this.undoStack.length - 1]
        const now = Date.now()
        const sameKeys =
          last?.length === steps.length && last.every((s) => s.coalesce && steps.some((t) => t.key === s.key))
        if (opts.coalesce && sameKeys && now - last![0].at < COALESCE_MS) {
          for (const s of last!) {
            s.next = steps.find((t) => t.key === s.key)!.next
            s.at = now
          }
        } else {
          for (const s of steps) s.coalesce = !!opts.coalesce
          this.undoStack.push(steps)
        }
        this.redoStack = []
      }
      this.emit()
    }
  }

  /** Mark everything pending as saved. */
  save(): void {
    this.saved = new Map(this.changes)
    this.emit()
  }

  get savedCount(): number {
    return this.saved.size
  }

  isSaved(key: string): boolean {
    return this.saved.get(key) === this.changes.get(key)
  }

  /**
   * Put back changes restored after a reload. They join the current state
   * without undo history (the old history belonged to the previous page).
   */
  load(items: LoadedChange[]): void {
    for (const item of items) {
      const key = changeKey(item.anchor, item.scope, item.owner, item.property)
      const change: Change = {
        key,
        seq: ++this.seq,
        anchor: item.anchor,
        scope: item.owner === 'parent' ? 'this' : item.scope,
        owner: item.owner,
        property: item.property,
        category: item.owner === 'icon' ? 'Icon' : categorize(item.property),
        targets: item.targets,
        members: item.members,
        before: item.before,
        after: item.after,
      }
      this.changes.set(key, change)
      if (item.saved) this.saved.set(key, change)
    }
    for (const el of new Set(items.flatMap((i) => i.targets))) this.sync(el)
    this.emit()
  }

  /** True when there are edits since the last save. */
  get dirty(): boolean {
    if (this.saved.size !== this.changes.size) return true
    for (const [k, c] of this.changes) if (this.saved.get(k) !== c) return true
    return false
  }

  /** Cancel: drop edits made since the last save (one undoable step). */
  revertUnsaved(): void {
    const keys = new Set([...this.changes.keys(), ...this.saved.keys()])
    const steps: HistoryStep[] = []
    for (const key of keys) {
      const prev = this.changes.get(key)
      const next = this.saved.get(key)
      if (prev !== next) steps.push({ key, prev, next, at: Date.now(), coalesce: false })
    }
    if (!steps.length) return
    for (const s of steps) this.write(s.key, s.next, s.prev)
    this.undoStack.push(steps)
    this.redoStack = []
    this.emit()
  }

  undo(): boolean {
    const step = this.undoStack.pop()
    if (!step) return false
    for (const s of [...step].reverse()) this.write(s.key, s.prev, s.next)
    this.redoStack.push(step)
    this.emit('undo')
    return true
  }

  redo(): boolean {
    const step = this.redoStack.pop()
    if (!step) return false
    for (const s of step) this.write(s.key, s.next, s.prev)
    this.undoStack.push(step)
    this.emit('redo')
    return true
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  /** Revert every pending change and forget history. */
  clear(): void {
    const touched = [...this.originals.keys()]
    this.changes.clear()
    this.saved.clear()
    this.undoStack = []
    this.redoStack = []
    for (const el of touched) this.sync(el)
    this.emit()
  }

  private write(key: string, value: Change | undefined, old: Change | undefined) {
    // Re-applied changes (redo, undo of a reset) keep their original order.
    if (value) this.changes.set(key, value)
    else this.changes.delete(key)
    const touched = new Set([...(value?.targets ?? []), ...(old?.targets ?? [])])
    for (const el of touched) this.sync(el)
  }

  /**
   * Rebuild an element's inline style from its original plus every change
   * targeting it, oldest first. Restores the exact original attribute when
   * nothing is left.
   */
  private sync(el: Element) {
    const style = (el as HTMLElement).style
    if (!style) return
    let original = this.originals.get(el)
    if (!original) {
      captureBaseline(el)
      original = { hadStyle: el.hasAttribute('style'), props: new Map() }
      this.originals.set(el, original)
    }
    const all = this.list().filter((c) => c.targets.includes(el))
    // Record each longhand the first time a change reaches it, before writing.
    for (const c of all) {
      for (const p of longhands(c.property)) {
        if (original.props.has(p)) continue
        if (isAttr(p)) {
          const v = el.getAttribute(p.slice(ATTR.length))
          original.props.set(p, { value: v ?? '', priority: v === null ? 'absent' : 'attr' })
        } else {
          original.props.set(p, { value: style.getPropertyValue(p), priority: style.getPropertyPriority(p) })
        }
      }
    }
    for (const [p, o] of original.props) {
      if (isAttr(p)) {
        if (o.priority === 'absent') el.removeAttribute(p.slice(ATTR.length))
        else el.setAttribute(p.slice(ATTR.length), o.value)
      } else if (o.value) style.setProperty(p, o.value, o.priority)
      else style.removeProperty(p)
    }
    for (const c of all) {
      if (isAttr(c.property)) el.setAttribute(c.property.slice(ATTR.length), c.after)
      else style.setProperty(c.property, c.after, 'important')
    }
    if (!original.hadStyle && style.length === 0) el.removeAttribute('style')
    if (!all.length) {
      this.originals.delete(el)
      dropBaseline(el)
    }
  }
}
