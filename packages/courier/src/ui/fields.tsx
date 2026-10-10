import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  convertLength,
  isValid,
  pageColors,
  pageFonts,
  parseLength,
  readComputed,
  rgbaToHex,
  toHex,
  type Option,
  type Owner,
} from '../core'
import { useEditor } from './editor'
import { Check, Chevron, ICONS, Reset } from './icons'

export type OnChange = (value: string, coalesce?: boolean) => void

// Computed keywords that mean the same thing as one of our options.
const ALIASES: Record<string, Record<string, string>> = {
  'align-items': { normal: 'stretch', start: 'flex-start', end: 'flex-end', 'self-start': 'flex-start', 'self-end': 'flex-end' },
  'text-align': { start: 'left', end: 'right', '-webkit-left': 'left', '-webkit-center': 'center', '-webkit-right': 'right' },
  'justify-content': { normal: 'flex-start', start: 'flex-start', end: 'flex-end', left: 'flex-start', right: 'flex-end' },
}

export function aliased(property: string, value: string): string {
  return ALIASES[property]?.[value] ?? value
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

/**
 * The text in an input. Follows the value, except for values this input sent
 * itself while focused: effects run after paint, so an echo of an earlier
 * keystroke can arrive after a newer one and must not overwrite it.
 */
function useDraft(display: string, value: string, onChange: OnChange) {
  const [draft, setDraft] = useState(display)
  const [editing, setEditing] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const sent = useRef(new Set<string>())
  const prevValue = useRef(value)
  useEffect(() => {
    const changed = prevValue.current !== value
    prevValue.current = value
    const echo = changed && sent.current.has(value)
    if (!editing || (changed && !echo)) {
      setDraft(display)
      setInvalid(false)
    }
  }, [display, value, editing])
  const send: OnChange = (v, coalesce) => {
    sent.current.add(v)
    onChange(v, coalesce)
  }
  // Focusing selects everything, so typing replaces the value. The mouseup
  // right after a click focus would otherwise drop the selection to a caret.
  const justFocused = useRef(false)
  const inputProps = {
    value: draft,
    spellcheck: false,
    onFocus: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
      setEditing(true)
      e.currentTarget.select()
      justFocused.current = true
    },
    onMouseUp: (e: JSX.TargetedMouseEvent<HTMLInputElement>) => {
      if (justFocused.current) e.preventDefault()
      justFocused.current = false
    },
    onBlur: () => {
      sent.current.clear()
      setEditing(false)
    },
  }
  return { draft, setDraft, editing, invalid, setInvalid, send, inputProps }
}

/**
 * Typing applies once you pause, not on every keystroke, so "28" doesn't flash
 * through "2" first. 400ms clears the gap between keystrokes for most people
 * without feeling unresponsive. Enter, leaving the field (Save, Copy, a tab,
 * Cmd+Z) or unmounting applies a pending value at once.
 */
const TYPING_DELAY = 400

function useTypingCommit(commit: (text: string) => void) {
  const latest = useRef(commit)
  latest.current = commit
  const pending = useRef<string | null>(null)
  const timer = useRef<number>()
  const cancel = () => {
    clearTimeout(timer.current)
    pending.current = null
  }
  const flush = () => {
    clearTimeout(timer.current)
    const t = pending.current
    pending.current = null
    if (t !== null) latest.current(t)
  }
  const schedule = (t: string) => {
    pending.current = t
    clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, TYPING_DELAY)
  }
  useEffect(() => {
    // Reloading mid pause still keeps what was typed (and the restore saves it).
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])
  return { schedule, flush, cancel }
}

/** Drag sideways on a field's prefix to change its value, like Figma. */
function useScrub(onSteps: (steps: number, e: PointerEvent) => void) {
  const latest = useRef(onSteps)
  latest.current = onSteps
  return (e: JSX.TargetedPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let lastX = e.clientX
    let acc = 0
    const move = (ev: PointerEvent) => {
      acc += ev.clientX - lastX
      lastX = ev.clientX
      const steps = Math.trunc(acc / 3)
      if (steps) {
        acc -= steps * 3
        latest.current(steps, ev)
      }
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
}

/** Track a pointer drag across an element as 0..1 coordinates. */
function useDrag(onMove: (x: number, y: number) => void) {
  const latest = useRef(onMove)
  latest.current = onMove
  return (e: JSX.TargetedPointerEvent<HTMLElement>) => {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const at = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const clamp = (n: number) => Math.min(1, Math.max(0, n))
      latest.current(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height))
    }
    at(e)
    const up = () => {
      el.removeEventListener('pointermove', at)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', at)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
}

// Row: label, control, reset. Reset covers every property the row edits.

export function Row({
  label,
  props,
  owner = 'self',
  parentProps = [],
  more = [],
  stacked,
  children,
  note,
}: {
  label: ComponentChildren
  props: string[]
  owner?: Owner
  /** Properties in the same row that live on the parent (the sibling gap). */
  parentProps?: string[]
  /** Other owners' properties shown in this row (a margin next to an inner gap). */
  more?: { props: string[]; owner: Owner }[]
  stacked?: boolean
  children: ComponentChildren
  note?: ComponentChildren
}) {
  const ed = useEditor()
  const groups = [{ props, owner }, { props: parentProps, owner: 'parent' as Owner }, ...more].map((g) => ({
    owner: g.owner,
    changed: g.props.filter((p) => ed.changed(p, g.owner)),
  }))
  const count = groups.reduce((n, g) => n + g.changed.length, 0)
  const first = groups.find((g) => g.changed.length)
  const only = first ? ed.changed(first.changed[0], first.owner) : null
  const reset = () => ed.store.batch(() => groups.forEach((g) => ed.resetMany(g.changed, g.owner)))
  return (
    <div class={`prow${stacked ? ' stacked' : ''}${count ? ' changed' : ''}`} data-row={[...props, ...parentProps].join(' ')}>
      <span class="plabel">{label}</span>
      <div class="pctl">{children}</div>
      <span class="preset">
        {count > 0 && (
          <button class="reset" data-tip={count === 1 ? `Reset to ${only!.before}` : 'Reset'} aria-label="Reset" onClick={reset}>
            <Reset />
          </button>
        )}
      </span>
      {note && <p class="pnote">{note}</p>}
    </div>
  )
}

// Choices for fields you can type in: shown while the field is empty, hidden
// as soon as you type.

interface Choice {
  label: string
  hint?: string
  /** A color shown before the label. */
  swatch?: string
  /** The CSS value it stands for (menus mark the current one). */
  value?: string
  selected?: boolean
  disabled?: boolean
  pick(): void
}

const CHOICES_MAX = 200

/** "fit-content" to "Fit content": readable labels, CSS values underneath. */
export const label = (v: string) => {
  const t = v.replace(/-/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function Choices({
  open,
  choices,
  checks,
  active = -1,
}: {
  open: boolean
  choices: Choice[]
  /** Menus: a check column marking the current value. */
  checks?: boolean
  /** Row highlighted from the keyboard. */
  active?: number
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState<JSX.CSSProperties>({ visibility: 'hidden' })
  // Fixed to the viewport so the panel's scroll area can't clip it; flips up
  // when there's no room below the field. Follows the field while open, since
  // the panel can resize (tab animation) or be dragged underneath it.
  useLayoutEffect(() => {
    if (!open) return
    let last = ''
    const place = () => {
      const anchor = ref.current?.parentElement
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const key = `${r.left}|${r.top}|${r.width}`
      if (key === last) return
      last = key
      const below = innerHeight - r.bottom - 8 >= Math.min(CHOICES_MAX, choices.length * 28 + 8)
      const width = Math.max(r.width, 168)
      setPos({
        left: Math.max(8, Math.min(r.left, innerWidth - width - 8)),
        width,
        ...(below ? { top: r.bottom + 4 } : { bottom: innerHeight - r.top + 4 }),
      })
    }
    let id = requestAnimationFrame(function loop() {
      place()
      id = requestAnimationFrame(loop)
    })
    place()
    return () => cancelAnimationFrame(id)
  }, [open, choices.length])
  if (!open || !choices.length) return null
  return (
    <ul class="choices" role="listbox" ref={ref} style={pos}>
      {choices.map((c, i) => (
        <li key={c.value ?? c.label}>
          <button
            role="option"
            aria-selected={c.selected}
            disabled={c.disabled}
            data-value={c.value}
            class={i === active ? 'active' : undefined}
            // Keep focus in the input until the pick has been applied.
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              c.pick()
              const input = (e.currentTarget as Element).closest('.combo')?.querySelector('input')
              input?.blur()
            }}
          >
            {checks && <span class="choice-check">{c.selected && <Check size={14} />}</span>}
            {c.swatch && <span class="choice-swatch" style={{ background: c.swatch }} />}
            <span class="choice-label">{c.label}</span>
            {c.hint && <span class="choice-hint">{c.hint}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

// Number and length

const CUSTOM = '__custom'

export interface NumberFieldProps {
  property: string
  owner?: Owner
  /** Short label or icon inside the field; drag it to scrub. */
  prefix?: ComponentChildren
  tip?: string
  units?: string[]
  keywords?: string[]
  min?: number
  max?: number
  step?: number
  /** Show 0..1 values as 0..100 % */
  percent?: boolean
  /** Override the value shown and where edits go (used by sizing). */
  value?: string
  muted?: boolean
  onValue?: OnChange
  /** Named values offered while the field is empty (font weights). */
  presets?: Option[]
  /** Replaces the unit shown at the end of the field. */
  suffix?: string
}

export function NumberField({
  property,
  owner = 'self',
  prefix,
  tip,
  units = ['px'],
  keywords = [],
  min,
  max,
  step = 1,
  percent,
  value: valueOverride,
  muted,
  onValue,
  presets = [],
  suffix,
}: NumberFieldProps) {
  const ed = useEditor()
  const value = valueOverride ?? ed.value(property, owner)
  const onChange: OnChange = onValue ?? ((v, c) => ed.set(property, owner, v, c))
  const parsed = parseLength(value)
  // A unitless value only counts as a number if the property takes numbers.
  const isNumber = !!parsed && (parsed.unit !== '' || units.includes('') || parsed.num === 0)
  const unit = isNumber ? parsed!.unit : keywords.includes(value) ? value : CUSTOM
  const numeric = isNumber ? (percent ? parsed!.num * 100 : parsed!.num) : null
  const numericUnit = isNumber ? parsed!.unit : units[0]

  // Keyword values (auto, normal) hint and step from their rendered size.
  const renderedPx = () => {
    const t = ed.primary(owner)
    return t ? parseFloat(readComputed(getComputedStyle(t), property)) || 0 : 0
  }
  const shown = numeric !== null ? fmt(numeric) : unit === CUSTOM ? value : ''
  const d = useDraft(shown, value, onChange)
  // Latest number this field holds, so rapid nudges build on each other.
  const last = useRef<number | null>(numeric)
  if (!d.editing) last.current = numeric

  const toValue = (n: number) => (percent ? String(Math.round(n * 100) / 10000) : `${fmt(n)}${numericUnit}`)
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max)

  const commit = (text: string, coalesce = true) => {
    const t = text.trim()
    if (!t) return d.setInvalid(false)
    const isNum = /^-?\d*\.?\d+$/.test(t)
    const v = isNum ? toValue(Number(t)) : t
    const n = isNum ? Number(t) : parseLength(v)?.num
    const ok = isValid(property, v) && (n === undefined || inRange(n))
    d.setInvalid(!ok)
    if (!ok) return
    if (isNum) last.current = Number(t)
    d.send(v, coalesce)
  }

  const typing = useTypingCommit((t) => commit(t))

  const nudge = (steps: number, e?: { shiftKey: boolean; altKey: boolean }) => {
    typing.flush()
    const size = e?.shiftKey ? step * 10 : e?.altKey ? step / 10 : step
    let next = Math.round(((last.current ?? renderedPx()) + steps * size) * 100) / 100
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    d.setDraft(fmt(next))
    commit(fmt(next))
  }
  const scrub = useScrub((steps, e) => nudge(steps, e))

  const switchUnit = (next: string) => {
    const t = ed.primary(owner)
    if (!t) return
    const from = isNumber ? parsed! : { num: renderedPx(), unit: 'px' }
    onChange(`${fmt(convertLength(t, property, from, next))}${next}`)
  }

  const choices: Choice[] = percent
    ? []
    : [
        // A pick replaces whatever was being typed.
        ...presets.map((p) => ({ label: p.label, hint: p.value, pick: () => (typing.cancel(), onChange(p.value)) })),
        ...keywords.map((k) => ({ label: label(k), pick: () => (typing.cancel(), onChange(k)) })),
        ...(units.length > 1
          ? units.filter((u) => u !== unit).map((u) => ({ label: `Convert to ${u || 'number'}`, pick: () => (typing.cancel(), switchUnit(u)) }))
          : []),
      ]

  return (
    <div class={`field combo${d.invalid ? ' invalid' : ''}${muted ? ' muted' : ''}`} data-property={property}>
      {prefix !== undefined && (
        <span class="prefix" onPointerDown={scrub} data-tip={tip} aria-hidden="true">
          {prefix}
        </span>
      )}
      <input
        {...d.inputProps}
        placeholder={unit !== CUSTOM && !isNumber ? (renderedPx() ? `${label(value)}  ${fmt(renderedPx())}` : label(value)) : undefined}
        inputMode="decimal"
        aria-label={tip ?? property}
        onBlur={() => {
          typing.flush()
          d.inputProps.onBlur()
        }}
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value
          d.setDraft(t)
          typing.schedule(t)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            nudge(e.key === 'ArrowUp' ? 1 : -1, e)
          } else if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <span class="suffix">{suffix ?? (percent ? '%' : isNumber ? numericUnit || '×' : '')}</span>
      <Choices open={d.editing && !d.draft.trim()} choices={choices} />
    </div>
  )
}

// Select

/**
 * A dropdown drawn by Courier, not the browser. Native menus can't be styled
 * reliably, and Safari draws them in Times because it can't resolve the
 * system font keyword there. Arrow keys change the value while closed, or
 * move through the open menu; Enter or Space picks, Escape closes.
 */
export function SelectField({
  property,
  owner = 'self',
  options,
  value: valueOverride,
  onValue,
}: {
  property: string
  owner?: Owner
  options: Option[]
  value?: string
  onValue?: (v: string) => void
}) {
  const ed = useEditor()
  const value = valueOverride ?? ed.value(property, owner)
  const list = options.some((o) => o.value === value) ? options : [{ value, label: label(value) }, ...options]
  const current = list.findIndex((o) => o.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(current)

  const choose = (v: string) => {
    setOpen(false)
    if (v === value) return
    if (onValue) onValue(v)
    else ed.set(property, owner, v)
  }
  // The next option that isn't disabled, from a starting row.
  const next = (from: number, dir: number) => {
    for (let i = from + dir; i >= 0 && i < list.length; i += dir) if (!list[i].disabled) return i
    return from
  }
  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    const dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (dir) {
      e.preventDefault()
      if (open) setActive(next(active, dir))
      else choose(list[next(current, dir)].value)
    } else if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      if (active >= 0 && !list[active].disabled) choose(list[active].value)
    } else if (open && e.key === 'Tab') setOpen(false)
  }

  return (
    <div class={`field select combo${open ? ' open' : ''}`} data-property={property}>
      <button
        type="button"
        class="select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={property}
        data-value={value}
        onClick={(e) => {
          // Safari doesn't focus buttons on click; the keyboard and close on blur need focus.
          e.currentTarget.focus()
          setActive(current)
          setOpen(!open)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      >
        <span class="select-label">{list[current]?.label ?? label(value)}</span>
      </button>
      <Chevron />
      <Choices
        open={open}
        checks
        active={active}
        choices={list.map((o) => ({
          label: o.label,
          value: o.value,
          disabled: o.disabled,
          selected: o.value === value,
          pick: () => choose(o.value),
        }))}
      />
    </div>
  )
}

// Segmented

export function SegField({
  property,
  owner = 'self',
  options,
  value: valueOverride,
  onValue,
  iconStyle,
}: {
  property: string
  owner?: Owner
  options: Option[]
  value?: string
  onValue?: (v: string) => void
  iconStyle?: JSX.CSSProperties
}) {
  const ed = useEditor()
  const value = valueOverride ?? ed.value(property, owner)
  const current = aliased(property, value)
  return (
    <div class="seg" role="radiogroup" aria-label={property} data-property={property}>
      {options.map((o) => {
        const Icon = o.icon ? ICONS[o.icon] : null
        return (
          <button
            key={o.value}
            class={o.value === current ? 'on' : ''}
            role="radio"
            aria-checked={o.value === current}
            aria-label={o.label}
            data-tip={Icon ? o.label : undefined}
            data-value={o.value}
            onClick={() => (onValue ? onValue(o.value) : ed.set(property, owner, o.value))}
          >
            {Icon ? (
              <span class="seg-icon" style={iconStyle}>
                <Icon />
              </span>
            ) : (
              o.label
            )}
          </button>
        )
      })}
    </div>
  )
}

// Color: hex field plus a hex based picker (no system color dialog).

interface Hsv {
  h: number
  s: number
  v: number
  a: number
}

function hexToHsv(hex: string): Hsv {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255
  const [r, g, b] = [n(1), n(3), n(5)]
  const a = hex.length === 9 ? n(7) : 1
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max, a }
}

function hsvToHex({ h, s, v, a }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
  }
  return rgbaToHex(f(5), f(3), f(1), Math.round(a * 100) / 100)
}

/**
 * Floats over the panel next to its anchor. Closes on a click outside, or
 * when the app asks it to (Escape) through a "close" event.
 */
function Popover({ anchor, onClose, children }: { anchor: HTMLElement; onClose(): void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<JSX.CSSProperties>({ visibility: 'hidden' })
  // Right under the field, matching its width; above it when there's no
  // room below. Kept inside the viewport either way.
  useLayoutEffect(() => {
    let last = ''
    const place = () => {
      const el = ref.current
      if (!el) return
      const a = anchor.getBoundingClientRect()
      const key = `${a.left}|${a.top}|${a.width}`
      if (key === last) return
      last = key
      const w = Math.max(a.width, 232)
      el.style.width = `${w}px`
      const h = el.offsetHeight
      const below = innerHeight - a.bottom - 8 >= h
      setPos({
        width: w,
        left: Math.max(8, Math.min(a.left, innerWidth - w - 8)),
        top: below ? a.bottom + 4 : Math.max(8, a.top - h - 4),
        transformOrigin: below ? 'top left' : 'bottom left',
      })
    }
    let id = requestAnimationFrame(function loop() {
      place()
      id = requestAnimationFrame(loop)
    })
    place()
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    const el = ref.current!
    const outside = (e: Event) => {
      const path = e.composedPath()
      if (!path.includes(el) && !path.includes(anchor)) onClose()
    }
    window.addEventListener('pointerdown', outside, true)
    el.addEventListener('close', onClose)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      el.removeEventListener('close', onClose)
    }
  }, [])
  return (
    <div class="popover" data-popover ref={ref} style={pos}>
      {children}
    </div>
  )
}

function Picker({ hex, onPick }: { hex: string; onPick: (hex: string) => void }) {
  const parsed = hexToHsv(hex)
  // Hue is kept locally so it survives dragging through grey (saturation 0).
  const [hue, setHue] = useState(parsed.h)
  useEffect(() => {
    if (parsed.s > 0 && parsed.v > 0) setHue(parsed.h)
  }, [hex])
  // From a fully transparent color, picking should produce something visible.
  const c = { ...parsed, h: hue, a: parsed.a === 0 ? 1 : parsed.a }
  const palette = useMemo(() => pageColors(), [])
  const sv = useDrag((x, y) => onPick(hsvToHex({ ...c, s: x, v: 1 - y })))
  const hueDrag = useDrag((x) => {
    setHue(x * 360)
    onPick(hsvToHex({ ...c, h: x * 360 }))
  })
  const alpha = useDrag((x) => onPick(hsvToHex({ ...c, a: x })))
  const solid = hsvToHex({ ...c, a: 1 })

  return (
    <div class="picker" data-picker>
      <div class="sv" style={{ background: `hsl(${hue} 100% 50%)` }} onPointerDown={sv}>
        <span class="thumb" style={{ left: `${c.s * 100}%`, top: `${(1 - c.v) * 100}%`, background: solid }} />
      </div>
      <div class="slider hue" onPointerDown={hueDrag} aria-label="Hue">
        <span class="thumb" style={{ left: `${(hue / 360) * 100}%`, background: `hsl(${hue} 100% 50%)` }} />
      </div>
      <div class="slider alpha" onPointerDown={alpha} aria-label="Opacity">
        <span class="alpha-fill" style={{ background: `linear-gradient(to right, transparent, ${solid})` }} />
        <span class="thumb" style={{ left: `${c.a * 100}%`, background: solid }} />
      </div>
      {palette.length > 0 && (
        <div class="palette" aria-label="Colors on this page">
          {palette.map((p) => (
            <button
              key={p}
              style={{ background: p }}
              data-tip={p}
              aria-label={p}
              onClick={() => onPick(p.slice(0, 7) + (hex.length === 9 && !hex.endsWith('00') ? hex.slice(7) : ''))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ColorField({ property, owner = 'self', autoOpen }: { property: string; owner?: Owner; autoOpen?: boolean }) {
  const ed = useEditor()
  const value = ed.value(property, owner)
  const hex = toHex(value) ?? value
  const base = hex.slice(0, 7)
  const alpha = /^#[0-9A-F]{8}$/i.test(hex) ? Math.round((parseInt(hex.slice(7), 16) / 255) * 100) : 100
  const [open, setOpen] = useState(false)
  const fieldRef = useRef<HTMLDivElement>(null)
  // Just added: open the picker once the field exists to anchor it.
  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [])
  const onChange: OnChange = (v, c) => ed.set(property, owner, v, c)
  const d = useDraft(base, value, onChange)
  const a = useDraft(String(alpha), value, onChange)
  const withAlpha = (hex6: string, pct: number) =>
    (pct >= 100 ? hex6 : hex6 + Math.round((pct / 100) * 255).toString(16).padStart(2, '0')).toUpperCase()

  const commitHex = (t: string) => {
    let v = t.trim()
    if (!v) return d.setInvalid(false)
    if (/^[0-9a-f]{3,8}$/i.test(v)) v = '#' + v
    // Hex, or any CSS color name ("red", "transparent"), stored as hex.
    const ok = isValid(property, v) && toHex(v) !== null
    d.setInvalid(!ok)
    if (!ok) return
    const h = toHex(v) ?? v
    // A typed color with its own alpha wins; otherwise keep the current alpha.
    d.send(h.length === 9 ? h : withAlpha(h.slice(0, 7), alpha), true)
  }
  const commitAlpha = (t: string) => {
    const n = Number(t)
    const ok = t.trim() !== '' && n >= 0 && n <= 100
    a.setInvalid(!ok)
    if (ok) a.send(withAlpha(base, n), true)
  }
  const typingHex = useTypingCommit(commitHex)
  const typingAlpha = useTypingCommit(commitAlpha)
  const scrub = useScrub((steps) => {
    typingAlpha.flush()
    const n = Math.max(0, Math.min(100, alpha + steps))
    a.setDraft(String(n))
    commitAlpha(String(n))
  })

  return (
    <div class="color-wrap">
      <div ref={fieldRef} class={`field color combo${d.invalid || a.invalid ? ' invalid' : ''}`} data-property={property}>
        <button
          class={`swatch${open ? ' on' : ''}`}
          aria-label={open ? 'Close color picker' : 'Open color picker'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span style={{ background: hex }} />
        </button>
        <input
          {...d.inputProps}
          class="hex"
          aria-label={`${property} hex`}
          onBlur={() => {
            typingHex.flush()
            d.inputProps.onBlur()
          }}
          onInput={(e) => {
            const t = (e.target as HTMLInputElement).value
            d.setDraft(t)
            typingHex.schedule(t)
          }}
        />
        <span class="divider" />
        <input
          {...a.inputProps}
          class="alpha"
          inputMode="numeric"
          aria-label={`${property} opacity`}
          onBlur={() => {
            typingAlpha.flush()
            a.inputProps.onBlur()
          }}
          onInput={(e) => {
            const t = (e.target as HTMLInputElement).value
            a.setDraft(t)
            typingAlpha.schedule(t)
          }}
        />
        <span class="suffix scrub" onPointerDown={scrub}>
          %
        </span>
        {d.editing && !d.draft.trim() && (
          <Choices
            open
            choices={pageColors(8).map((c) => ({
              label: c,
              swatch: c,
              pick: () => (typingHex.cancel(), onChange(c.length === 9 ? c : withAlpha(c, alpha))),
            }))}
          />
        )}
      </div>
      {open && fieldRef.current && (
        <Popover anchor={fieldRef.current} onClose={() => setOpen(false)}>
          <Picker hex={hex.length === 7 || hex.length === 9 ? hex : '#000000'} onPick={(h) => onChange(h, true)} />
        </Popover>
      )}
    </div>
  )
}

// Free text, validated with CSS.supports, with choices when empty.

export function TextField({
  property,
  owner = 'self',
  autoFocus,
  onDone,
}: {
  property: string
  owner?: Owner
  autoFocus?: boolean
  /** Called when the field loses focus. */
  onDone?: () => void
}) {
  const ed = useEditor()
  const value = ed.value(property, owner)
  const onChange: OnChange = (v, c) => ed.set(property, owner, v, c)
  const d = useDraft(value, value, onChange)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [])
  const typing = useTypingCommit((t) => {
    if (!t.trim()) return d.setInvalid(false)
    const ok = isValid(property, t)
    d.setInvalid(!ok)
    if (ok) d.send(t.trim(), true)
  })
  const choices: Choice[] =
    property === 'font-family'
      ? [...new Set([...pageFonts(), 'system-ui, sans-serif', 'Georgia, serif', 'ui-monospace, monospace'])].map((f) => ({
          // Name the stack by its first family; the full stack is what gets applied.
          label: label(f.split(',')[0].replace(/["']/g, '')),
          pick: () => (typing.cancel(), onChange(f)),
        }))
      : []
  return (
    <div class={`field combo${d.invalid ? ' invalid' : ''}`} data-property={property}>
      <input
        {...d.inputProps}
        ref={ref}
        onBlur={() => {
          typing.flush()
          d.inputProps.onBlur()
          onDone?.()
        }}
        aria-label={property}
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value
          d.setDraft(t)
          typing.schedule(t)
        }}
      />
      <Choices open={d.editing && !d.draft.trim()} choices={choices} />
    </div>
  )
}

/**
 * The font stack, shown as plain grey text. It's only worth changing to a
 * font the page already loads, so editing is one click away rather than an
 * always visible field.
 */
export function FontField({ owner = 'self' }: { owner?: Owner }) {
  const ed = useEditor()
  const [editing, setEditing] = useState(false)
  if (editing) return <TextField property="font-family" owner={owner} autoFocus onDone={() => setEditing(false)} />
  return (
    <button class="font-display" data-property="font-family" data-tip="Click to change" onClick={() => setEditing(true)}>
      {ed.value('font-family', owner)}
    </button>
  )
}

export function ReadOnly({ value, prefix, tip }: { value: string; prefix?: ComponentChildren; tip?: string }) {
  return (
    <div class="field readonly" aria-readonly="true">
      {prefix !== undefined && (
        <span class="prefix static" data-tip={tip} aria-hidden="true">
          {prefix}
        </span>
      )}
      <input value={value} readOnly tabIndex={-1} aria-label={tip} />
    </div>
  )
}
