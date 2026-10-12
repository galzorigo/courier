import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks'
import { buildExport, elementId, findMatches, type ChangeStore, type Scope, type SourceResolver } from '../core'
import { copyText } from './clipboard'
import { EditorContext, createEditor } from './editor'
import { Highlights, useFrame } from './highlights'
import { Check, Close, Copy, Eye, EyeOff, PencilFill, Trash } from './icons'
import { useInspect } from './inspect'
import { Inspector, selectableChild, selectableParent } from './inspector'

/** Outcome of restoring changes after a reload, filled in by mount(). */
export interface RestoreReport {
  result: { restored: number; missing: number } | null
  listeners: Set<() => void>
}

export interface AppProps {
  store: ChangeStore
  host: Element
  resolveSource?: SourceResolver
  report?: RestoreReport
}

const PANEL_WIDTH = 344 + 32

export function App({ store, host, resolveSource, report }: AppProps) {
  const [, rerender] = useReducer((n: number, _: number) => n + 1, 0)
  useEffect(() => store.subscribe(() => rerender(0)), [store])
  // Undo and redo can move edits between "this one" and "all matching"; the
  // checkbox follows the selection's latest unsaved edit so it never lies.
  useEffect(
    () =>
      store.subscribe(() => {
        const { selected } = latest.current
        if (store.lastOp === 'edit' || !selected) return
        const mine = store
          .list()
          .filter((c) => c.owner !== 'parent' && c.members.includes(selected) && !store.isSaved(c.key))
          .pop()
        if (mine) setScope(mine.scope)
      }),
    [store],
  )

  const [open, setOpen] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [hovered, setHovered] = useState<Element | null>(null)
  const [selected, setSelected] = useState<Element | null>(null)
  const [scope, setScope] = useState<Scope>('this')
  const [tab, setTab] = useState<string | null>(null)
  // Where the panel was dragged to, relative to its docked position.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [toast, setToast] = useState<string | null>(null)
  // Shown when the clipboard is unavailable (plain http on a phone).
  const [manualCopy, setManualCopy] = useState<string | null>(null)
  const toastTimer = useRef<number>()
  // The panel grows out of the dock only when a click opens it from nothing.
  // Switching elements, or Enter and Shift Enter, swap it in place.
  const [enter, setEnter] = useState(false)
  const copied = !!toast?.startsWith('Copied')
  // Opening or closing from the keyboard skips the expand animation.
  const [instant, setInstant] = useState(false)
  // The eye: hides the numbered badges on the page, never the changes themselves
  const [badgesHidden, setBadgesHidden] = useState(false)
  const copyIcon = useRef<HTMLSpanElement>(null)

  const matches = useMemo(() => (selected ? findMatches(selected) : []), [selected])
  const multi = matches.length > 1
  const effectiveScope: Scope = multi ? scope : 'this'

  const shield = useRef<HTMLDivElement>(null)
  const pick = (el: Element) => {
    setEnter(!selected)
    setSelected(el)
  }
  const shieldHandlers = useInspect(open && inspecting, host, shield, setHovered, pick)

  // Drop the selection if the element leaves the page (HMR, route change).
  useEffect(() => {
    if (selected && !selected.isConnected) setSelected(null)
  })

  // Fields show computed values, read when the panel renders. A site that
  // transitions a property (a button's background) is still mid way when a
  // reset, undo or redo re-renders, so the field would keep the old value.
  // Read again once a transition on the element, inside it or its parent ends,
  // and when its size settles (the Hug and Fill readouts measure it).
  useEffect(() => {
    if (!selected) return
    let frame = 0
    const again = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => rerender(0))
    }
    const settle = (e: Event) => {
      const t = e.target as Element
      if (t === selected || selected.contains(t) || t === selected.parentElement) again()
    }
    document.addEventListener('transitionend', settle, true)
    document.addEventListener('transitioncancel', settle, true)
    const sized = new ResizeObserver(again)
    sized.observe(selected)
    return () => {
      sized.disconnect()
      cancelAnimationFrame(frame)
      document.removeEventListener('transitionend', settle, true)
      document.removeEventListener('transitioncancel', settle, true)
    }
  }, [selected])

  // Which button a message is about, so it can sit right above it.
  const toastAnchor = useRef<'copy' | 'trash'>('copy')
  const toastRef = useRef<HTMLSpanElement>(null)
  const flash = (msg: string, ms = 1800, anchor: 'copy' | 'trash' = 'copy') => {
    toastAnchor.current = anchor
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), ms)
  }

  // Centered over its button: copy for Saved and Copied (the saved count
  // lives there), trash for Deleted, the pencil while Courier is collapsed.
  // Kept inside the screen. Beside the pill while a panel is open.
  useLayoutEffect(() => {
    const t = toastRef.current
    if (!t || selected) {
      if (t) t.style.left = ''
      return
    }
    const wrap = t.parentElement!
    const tool = wrap.querySelector(`[data-tool="${open ? toastAnchor.current : 'launcher'}"]`)
    if (!tool) return
    const w = wrap.getBoundingClientRect()
    const b = tool.getBoundingClientRect()
    const half = t.offsetWidth / 2
    const center = Math.max(8 + half, Math.min(b.left + b.width / 2, innerWidth - 8 - half))
    t.style.left = `${center - w.left}px`
  }, [toast, open, selected])

  // Say what came back after a reload, and what couldn't.
  useEffect(() => {
    if (!report) return
    const show = () => {
      const r = report.result
      if (!r) return
      const n = (k: number) => `${k} ${k === 1 ? 'change' : 'changes'}`
      if (r.missing && r.restored) flash(`Restored ${n(r.restored)}. ${n(r.missing)} could not be found`, 4000)
      else if (r.missing) flash(`${n(r.missing)} could not be found after reload`, 4000)
      else flash(`Restored ${n(r.restored)}`, 2400)
    }
    show()
    report.listeners.add(show)
    return () => report.listeners.delete(show)
  }, [report])

  const save = () => {
    store.save()
    setSelected(null)
    flash('Saved')
  }

  // Copy everything saved. Unsaved edits are visible on the page, so they
  // are saved first rather than silently left out.
  const copy = async () => {
    if (store.dirty) store.save()
    const n = store.size
    if (!n) return shake()
    const text = buildExport(store.list(), {
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      resolveSource,
    })
    if (!(await copyText(text, host.shadowRoot!))) return setManualCopy(text)
    // Copied changes are handed off to the agent, so they stop being pending.
    store.clear()
    setSelected(null)
    flash(`Copied ${n} ${n === 1 ? 'change' : 'changes'}`)
  }

  // Nothing to copy: the icon shakes "no". The tooltip already says why.
  const shake = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    copyIcon.current?.animate(
      [0, -3, 3, -2, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 280, easing: 'ease-in-out' },
    )
  }

  /**
   * The checkbox scopes the edits already made, not just future ones.
   * Unchecking moves unsaved group edits back onto the selected element
   * (the other matches revert); checking spreads its unsaved single edits to
   * every match. Saved edits were committed, so they stay. One undo step.
   */
  const rescope = (to: Scope) => {
    setScope(to)
    if (!selected) return
    const from: Scope = to === 'all' ? 'this' : 'all'
    const anchor = from === 'all' ? matches[0] : selected
    const moving = store
      .list()
      .filter((c) => c.owner !== 'parent' && c.scope === from && c.anchor === anchor && !store.isSaved(c.key))
    if (!moving.length) return
    const target = createEditor(store, selected, matches, to)
    store.batch(() => {
      for (const c of moving) {
        store.reset(c.key)
        target.set(c.property, c.owner, c.after)
      }
    })
  }

  /**
   * Delete every change, saved or not. One undo step, so Cmd+Z brings them all
   * back (as unsaved). Saving afterwards keeps the copy badge in step.
   */
  const deleteAll = () => {
    const keys = store.list().map((c) => c.key)
    if (!keys.length) return
    store.batch(() => keys.forEach((k) => store.reset(k)))
    store.save()
    setSelected(null)
    flash(`Deleted ${keys.length} ${keys.length === 1 ? 'change' : 'changes'}`, 1800, 'trash')
  }

  /**
   * Reset everything on the selected element, saved or not: its own edits,
   * any group edit it belongs to (reset for every match, a group edit is one
   * change), and the parent gap shown in its panel. One undo step.
   */
  const resetElement = () => {
    if (!selected) return
    const keys = store.forElement(selected).map((c) => c.key)
    store.batch(() => keys.forEach((k) => store.reset(k)))
  }

  // Up to the parent: the way to reach a container its children completely cover.
  const selectParent = () => {
    const p = latest.current.selected && selectableParent(latest.current.selected)
    if (p) {
      setEnter(false)
      setSelected(p)
    }
  }

  // Down into the element: how a link's inner row is reached, since clicks pick the link.
  const selectChild = () => {
    const c = latest.current.selected && selectableChild(latest.current.selected)
    if (c) {
      setEnter(false)
      setSelected(c)
    }
  }

  const cancel = () => {
    if (store.dirty) store.revertUnsaved()
    else setSelected(null)
  }

  const close = (viaKeyboard = false) => {
    setInstant(viaKeyboard)
    setOpen(false)
    setInspecting(false)
    setSelected(null)
  }

  // Read by the key listener, which is registered once per open.
  const latest = useRef({ selected, manualCopy })
  latest.current = { selected, manualCopy }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const { selected, manualCopy } = latest.current
      const inPage = !e.composedPath().includes(host)
      const t = e.target as HTMLElement
      // Leave the page's own text fields alone.
      if (inPage && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const mod = e.metaKey || e.ctrlKey
      // Leave the field first, so it shows the restored value instead of what was typed.
      const leaveField = () => (host.shadowRoot!.activeElement as HTMLElement | null)?.blur()
      // Only take Cmd+Z when Courier has something to undo (or the key came
      // from Courier's own fields); otherwise it belongs to the page.
      const ours = !inPage || (e.shiftKey ? store.canRedo : store.canUndo)
      if (mod && e.key.toLowerCase() === 'z' && ours) {
        e.preventDefault()
        e.stopPropagation()
        leaveField()
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if (mod && e.key.toLowerCase() === 'y' && (!inPage || store.canRedo)) {
        e.preventDefault()
        leaveField()
        store.redo()
      } else if (
        e.key === 'Enter' &&
        selected &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test((e.composedPath()[0] as Element).tagName) &&
        (e.shiftKey || (e.composedPath()[0] as Element).tagName !== 'BUTTON')
      ) {
        // Shift+Enter selects the parent, Enter a child, as in Figma. Never while
        // typing in a field. Plain Enter on a focused button still presses it.
        e.preventDefault()
        if (e.shiftKey) selectParent()
        else selectChild()
      } else if (e.key === 'Escape') {
        // One layer per press: an open overlay first, then the panel, then Courier.
        e.stopPropagation()
        const root = host.shadowRoot!
        const popover = root.querySelector('[data-popover]')
        const field = root.activeElement as HTMLElement | null
        if (popover) popover.dispatchEvent(new Event('close'))
        else if (root.querySelector('.choices') && field) field.blur()
        else if (manualCopy) setManualCopy(null)
        else if (selected) setSelected(null)
        else close(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  // A click anywhere outside the focused field closes its choices, including
  // dead space in the panel (where dragging would otherwise keep focus).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const field = host.shadowRoot!.activeElement as HTMLElement | null
      const combo = field?.closest('.combo')
      if (combo && !e.composedPath().includes(combo)) field!.blur()
    }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [])

  // Keep the dock off the selected element.
  const dockLeft = (() => {
    // Once the panel has been dragged, it stays where it was put.
    if (offset.x || offset.y || !selected?.isConnected) return false
    const r = selected.getBoundingClientRect()
    return r.right > innerWidth - PANEL_WIDTH && r.bottom > innerHeight * 0.35 && r.left > PANEL_WIDTH
  })()

  const total = store.size
  const saved = store.savedCount

  /**
   * Drag the panel from any non interactive spot. At least 20% of it stays
   * on screen in each direction.
   */
  const startDrag = (e: JSX.TargetedPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const target = e.target as Element
    if (target.closest('button, input, select, textarea, label, a, .field, .seg, .tabs, .choices, .popover')) return
    e.preventDefault()
    const panel = e.currentTarget
    panel.setPointerCapture(e.pointerId)
    const r = panel.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
    const move = (ev: PointerEvent) => {
      const left = clamp(r.left + ev.clientX - start.x, -0.8 * r.width, innerWidth - 0.2 * r.width)
      const top = clamp(r.top + ev.clientY - start.y, -0.8 * r.height, innerHeight - 0.2 * r.height)
      setOffset({ x: start.ox + left - r.left, y: start.oy + top - r.top })
    }
    const up = () => {
      panel.removeEventListener('pointermove', move)
      panel.removeEventListener('pointerup', up)
      panel.removeEventListener('pointercancel', up)
    }
    panel.addEventListener('pointermove', move)
    panel.addEventListener('pointerup', up)
    panel.addEventListener('pointercancel', up)
  }

  const editor = open && selected ? createEditor(store, selected, matches, effectiveScope) : null
  const footer = (
    <footer class="panel-foot">
      {multi && (
        <label class="check-row">
          <span>
            Apply to all <b>{matches.length}</b> matching elements
          </span>
          <input
            type="checkbox"
            class="check"
            data-scope-all
            checked={effectiveScope === 'all'}
            onChange={(e) => rescope((e.target as HTMLInputElement).checked ? 'all' : 'this')}
          />
          <span class="check-box" aria-hidden="true">
            <Check size={12} />
          </span>
        </label>
      )}
      <div class="row spread">
        <button class="btn btn-ghost" data-cancel onClick={cancel}>
          Cancel
        </button>
        <div class="row">
          <button
            class="btn btn-ghost"
            data-reset-element
            disabled={!selected || !store.forElement(selected).length}
            onClick={resetElement}
          >
            Reset changes
          </button>
          <button class="btn btn-primary" disabled={!store.dirty} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </footer>
  )

  return (
    <>
      {/* Covers the page while inspecting so it never sees the pointer (no hover states). Below everything else of Courier's. */}
      {open && inspecting && <div class="shield" ref={shield} data-shield {...shieldHandlers} />}
      {total > 0 && !badgesHidden && (
        <Markers
          store={store}
          selected={selected}
          onPick={(el) => {
            setInstant(false)
            setOpen(true)
            pick(el)
          }}
        />
      )}
      {open && (
        <Highlights
          hovered={inspecting ? hovered : null}
          selected={selected}
          matches={effectiveScope === 'all' ? matches : []}
        />
      )}
      <div class={`dock${dockLeft ? ' left' : ''}`}>
        {manualCopy && (
          <section class="panel" aria-label="Copy these changes">
            <header class="panel-head">
              <div class="panel-title">
                <h2>Copy these changes</h2>
                <p>The clipboard is blocked on this connection</p>
              </div>
              <button class="icon-btn" aria-label="Close" onClick={() => setManualCopy(null)}>
                <Close />
              </button>
            </header>
            <div class="panel-body">
              <textarea class="preview" readOnly value={manualCopy} ref={(t) => t?.select()} aria-label="Export" />
            </div>
          </section>
        )}
        {editor && !manualCopy && (
          <EditorContext.Provider value={editor}>
            <Inspector
              // A fresh inspector per element: added sections belong to one selection.
              key={elementId(selected!)}
              footer={footer}
              tab={tab}
              onTab={setTab}
              onClose={() => setSelected(null)}
              onParent={selectParent}
              onChild={selectChild}
              panelProps={{
                onPointerDown: startDrag,
                'data-enter': enter || undefined,
                // Offsets, not a transform: a transform would become the
                // containing block for the fixed choices and color picker.
                style: offset.x || offset.y ? { position: 'relative', left: offset.x, top: offset.y } : undefined,
              }}
            />
          </EditorContext.Provider>
        )}
        {/*
          One pill. Collapsed it shows only the pencil; opening reveals copy
          and close by unclipping the pill leftwards while the row slides
          with it, so the tools come out of the launcher.
        */}
        <div class="toolbar-wrap">
          {toast && (
            <span class={`toast${selected ? ' beside' : ''}`} role="status" data-toast ref={toastRef}>
              {toast}
            </span>
          )}
          <div class={`toolbar${open ? ' open' : ''}${instant ? ' instant' : ''}`} role="toolbar" aria-label="Courier">
            <div class="toolbar-row">
              {/* Hides only the numbered badges. The changes stay on the page */}
              <button
                class={`tool${badgesHidden ? ' on' : ''}`}
                aria-label={badgesHidden ? 'Show badges' : 'Hide badges'}
                aria-pressed={badgesHidden}
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                data-eye
                data-tip={!total ? 'No changes yet' : badgesHidden ? 'Show badges' : 'Hide badges'}
                onClick={() => total && setBadgesHidden(!badgesHidden)}
              >
                {badgesHidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button
                class="tool"
                aria-label="Copy all saved changes"
                data-tool="copy"
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                data-tip={total ? 'Copy all saved changes' : 'Nothing saved yet'}
                onClick={copy}
              >
                {/* Both stay mounted so copied and back crossfade. */}
                <span class={`tool-icon swap-box${copied ? ' copied' : ''}`} ref={copyIcon}>
                  <span class={`swap${copied ? ' off' : ''}`}>
                    <Copy size={18} />
                  </span>
                  <span class={`swap${copied ? '' : ' off'}`}>
                    <Check size={18} />
                  </span>
                </span>
                {saved > 0 && (
                  <span class="badge" data-saved>
                    {saved}
                  </span>
                )}
              </button>
              <button
                class="tool"
                aria-label="Delete all changes"
                data-tool="trash"
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                data-trash
                data-tip={total ? 'Delete all changes' : 'No changes yet'}
                onClick={deleteAll}
              >
                <Trash size={18} />
              </button>
              {/* The launcher: a pencil while collapsed, the close button once open. Inspecting is on whenever Courier is open. */}
              <button
                class={`tool launcher${open ? ' is-open' : ''}`}
                data-courier-launcher
                data-tool="launcher"
                aria-label={open ? 'Close' : 'Open Courier'}
                data-tip={open ? 'Close' : 'Edit styles'}
                onClick={(e) => {
                  // Clicked, not keyed: let go of focus, or Enter (select child) would
                  // press this button again and close Courier.
                  if (e.detail !== 0) e.currentTarget.blur()
                  if (open) return close(e.detail === 0)
                  setInstant(e.detail === 0)
                  setOpen(true)
                  setInspecting(true)
                }}
              >
                <span class="morph pencil">
                  <PencilFill size={18} />
                </span>
                <span class="morph x">
                  <Close size={18} />
                </span>
              </button>
            </div>
          </div>
          {/* Outside the clipped pill: collapsed, the pill is clipped to a circle that would cut a corner badge off. */}
          {!open && total > 0 && (
            <span class="badge launcher-badge" data-launcher-badge>
              {total}
            </span>
          )}
        </div>
      </div>
      <Tooltip root={host.shadowRoot!} quiet={!!toast} />
    </>
  )
}

/**
 * A numbered badge on every element with changes, at its top right corner.
 * Clicking one opens that element. Hidden with the eye toggle.
 */
function Markers({ store, selected, onPick }: { store: ChangeStore; selected: Element | null; onPick(el: Element): void }) {
  useFrame()
  const counts = new Map<Element, number>()
  for (const c of store.list()) {
    for (const el of c.owner === 'parent' ? [c.anchor] : c.members) counts.set(el, (counts.get(el) ?? 0) + 1)
  }
  return (
    <>
      {[...counts].map(([el, n], i) => {
        if (el === selected || !el.isConnected) return null
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > innerHeight || (!r.width && !r.height)) return null
        return (
          <button
            key={i}
            class="marker"
            data-marker
            style={{ left: r.right, top: r.top }}
            aria-label={`${n} ${n === 1 ? 'change' : 'changes'}, edit`}
            data-tip={`${n} ${n === 1 ? 'change' : 'changes'}`}
            onClick={() => onPick(el)}
          >
            {n}
          </button>
        )
      })}
    </>
  )
}

/**
 * One tooltip for every [data-tip], drawn above everything so the panel's
 * rounded clipping can't cut it off. Flips below near the top of the screen
 * and stays inside the viewport. Quiet while a message shows, so the two never
 * stack up (pressing copy turns its tip into "Nothing saved yet" right under the
 * "Copied" message); once the message goes, a still hovered tip comes back.
 */
function Tooltip({ root, quiet }: { root: ShadowRoot; quiet: boolean }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  // A press hides the tip until the pointer leaves, or until the message it
  // caused has gone.
  const [held, setHeld] = useState(false)
  const wasQuiet = useRef(quiet)
  useEffect(() => {
    if (wasQuiet.current && !quiet) setHeld(false)
    wasQuiet.current = quiet
  }, [quiet])
  // Read at render time, so a tip that comes back after a message is current.
  const text = target?.isConnected ? target.dataset.tip : undefined
  const tip = text && !quiet && !held ? { text, rect: target!.getBoundingClientRect() } : null
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const over = (e: Event) => {
      const t = (e.target as Element).closest?.('[data-tip]') as HTMLElement | null
      const next = t?.dataset.tip ? t : null
      setTarget((prev) => {
        if (prev !== next) setHeld(false)
        return next
      })
    }
    const hide = () => setTarget(null)
    const press = () => setHeld(true)
    // pointerout fires on the element being left and says where the pointer
    // went; leaving for anything without its own tip (or the page) hides it.
    const out = (e: Event) => {
      const to = (e as PointerEvent).relatedTarget as Element | null
      const next = to?.closest?.('[data-tip]')
      if (!next || !root.contains(next)) hide()
    }
    root.addEventListener('pointerover', over)
    root.addEventListener('pointerout', out)
    root.addEventListener('pointerdown', press)
    return () => {
      root.removeEventListener('pointerover', over)
      root.removeEventListener('pointerout', out)
      root.removeEventListener('pointerdown', press)
    }
  }, [root])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !tip) return
    const { rect } = tip
    const w = el.offsetWidth
    const h = el.offsetHeight
    const above = rect.top - h - 6 >= 8
    el.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, innerWidth - w - 8))}px`
    el.style.top = `${above ? rect.top - h - 6 : rect.bottom + 6}px`
    el.style.visibility = 'visible'
  }, [tip?.text, tip?.rect.left, tip?.rect.top])
  if (!tip) return null
  return (
    <div class="tooltip" role="tooltip" ref={ref} key={tip.text + tip.rect.left + tip.rect.top}>
      {tip.text}
    </div>
  )
}
