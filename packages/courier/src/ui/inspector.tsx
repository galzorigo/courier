// One stacked properties panel, like Figma or Framer. The category chips at
// the top jump to a section and carry the pending change counts.

import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import {
  GROUPS,
  describe,
  gapApplies,
  gapProperties,
  innerLayout,
  layoutItems,
  isFlex,
  isGrid,
  fontWeights,
  baseline,
  hasBorder,
  measureSiblingSpacing,
  shortName,
  toHex,
  renderedWeight,
  parseLength,
  sectionsFor,
  rememberSizeBefore,
  sizeInfo,
  sizeProperties,
  specFor,
  usedCategories,
  type Category,
  type Option,
  type Owner,
  type SiblingSpacing,
  type SizeAxis,
  type SizeMode,
} from '../core'
import { useEditor } from './editor'
import { ColorField, FontField, NumberField, ReadOnly, Row, SegField, SelectField, aliased, label } from './fields'
import { Close, Glyph, Redo, Undo } from './icons'

const optionsOf = (property: string): Option[] => {
  const c = specFor(property).control
  if (c.kind === 'segmented') return c.options
  if (c.kind === 'select') return c.options.map((v) => ({ value: v, label: label(v) }))
  return []
}

const DISTRIBUTE: Option[] = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
  { value: 'space-evenly', label: 'Space evenly' },
]

const WEIGHTS: Option[] = [
  ['100', 'Thin'],
  ['200', 'Extra light'],
  ['300', 'Light'],
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['600', 'Semibold'],
  ['700', 'Bold'],
  ['800', 'Extra bold'],
  ['900', 'Black'],
].map(([value, name]) => ({ value, label: name }))

const SIZE_MODES: Option[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hug', label: 'Hug' },
  { value: 'fill', label: 'Fill' },
]

const BOX = ['px', 'rem', 'em', '%']

/** The parent worth selecting: never <body> or <html>. */
export function selectableParent(el: Element): Element | null {
  const p = el.parentElement
  return p && p !== document.body && p !== document.documentElement ? p : null
}

/**
 * The child worth selecting: the wrapper that lays out the content when there
 * is one (a link's inner row), otherwise the first child in the layout flow.
 * Clicks inside a link pick the link, so this is how its inside is reached.
 */
export function selectableChild(el: Element): Element | null {
  const inner = innerLayout(el)
  if (inner) return inner
  return (
    [...el.children].find((c) => {
      if (c.closest('svg') !== c && c instanceof SVGElement) return false
      const cs = getComputedStyle(c)
      return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed'
    }) ?? null
  )
}

/** Tabs group categories into a few panels. Counts add up. */
interface TabDef {
  id: string
  label: string
  categories: Category[]
}
const TABS: TabDef[] = [
  { id: 'Layout', label: 'Layout', categories: ['Layout', 'Size', 'Spacing'] },
  { id: 'Appearance', label: 'Appearance', categories: ['Fill', 'Shape', 'Border'] },
  { id: 'Text', label: 'Text', categories: ['Text'] },
  { id: 'Icon', label: 'Icon', categories: ['Icon'] },
]


export function Inspector({
  footer,
  tab,
  onTab,
  onClose,
  onParent,
  onChild,
  panelProps,
}: {
  footer: ComponentChildren
  /** The last tab opened; kept across selections. */
  tab: string | null
  onTab(id: string): void
  onClose(): void
  /** Select the element's parent (cards can fill a grid so it can't be clicked). */
  onParent(): void
  /** Select the element inside that lays out its content. */
  onChild(): void
  /** Drag handling and position, owned by the app. */
  panelProps?: JSX.HTMLAttributes<HTMLElement> & { 'data-enter'?: boolean }
}) {
  const ed = useEditor()
  const byCategory = ed.store.countByCategory(ed.el)
  const used = new Set(usedCategories(ed.el))
  // Sections the user added with the + buttons (Fill on a plain heading).
  // Inspector is keyed per element, so this starts empty for each selection.
  const [added, setAdded] = useState<Set<Category>>(new Set())
  const [justAdded, setJustAdded] = useState<Category | null>(null)
  // Shown if the element uses it, has pending changes in it, or it was added.
  const has = (c: Category) => used.has(c) || byCategory.has(c) || added.has(c)
  const box = !['contents', 'none'].includes(getComputedStyle(ed.el).display)
  // Layout always; Appearance on any box so a fill, radius or border can be
  // added; Text and Icon only when the element has them.
  const shown = TABS.filter(
    (t) => t.id === 'Layout' || (t.id === 'Appearance' && box) || t.categories.some(has),
  )
  const add = (c: Category) => {
    if (c === 'Border') {
      // Visible right away, like adding a stroke in a design tool.
      const color = toHex(getComputedStyle(ed.el).color) ?? '#000000'
      ed.setMany({ 'border-style': 'solid', 'border-width': '1px', 'border-color': color.slice(0, 7) })
    }
    setAdded(new Set([...added, c]))
    setJustAdded(c)
  }
  const remove = (c: Category) => {
    const next = new Set(added)
    next.delete(c)
    setAdded(next)
    if (justAdded === c) setJustAdded(null)
  }
  const counts = new Map(shown.map((t) => [t.id, t.categories.reduce((n, c) => n + (byCategory.get(c) ?? 0), 0)]))
  const active = shown.find((t) => t.id === tab) ?? shown[0]
  const d = describe(ed.el)
  const parent = selectableParent(ed.el)
  const child = selectableChild(ed.el)

  const body = useRef<HTMLDivElement>(null)

  // The panel has a fixed height; a tab switch only swaps what scrolls inside.
  const switchTab = (id: string) => {
    if (id !== active.id) onTab(id)
  }

  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [active.id])

  // A down arrow while there's more below; gone once scrolled to the bottom or
  // everything fits. Checked after every render (tab switches, added sections),
  // on scroll, and when the panel resizes.
  const [more, setMore] = useState(false)
  const measure = () => {
    const el = body.current
    if (!el) return
    const next = el.scrollTop + el.clientHeight < el.scrollHeight - 2
    setMore((prev) => (prev === next ? prev : next))
  }
  useLayoutEffect(measure)
  useEffect(() => {
    const el = body.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <section class="panel" aria-label="Styles used on this element" {...panelProps}>
      <header class="panel-head">
        <div class="panel-title">
          <h2>{d.short}</h2>
        </div>
        {parent && (
          <button
            class="icon-btn flat"
            data-select-parent
            data-tip={`Select parent ${shortName(parent)}, Shift Enter`}
            aria-label="Select parent"
            onClick={onParent}
          >
            <Glyph name="parent" />
          </button>
        )}
        {child && (
          <button
            class="icon-btn flat"
            data-select-child
            data-tip={`Select child ${shortName(child)}, Enter`}
            aria-label="Select child"
            onClick={onChild}
          >
            <Glyph name="child" />
          </button>
        )}
        <button class="icon-btn flat" data-tip="Undo" aria-label="Undo" disabled={!ed.store.canUndo} onClick={() => ed.store.undo()}>
          <Undo />
        </button>
        <button class="icon-btn flat" data-tip="Redo" aria-label="Redo" disabled={!ed.store.canRedo} onClick={() => ed.store.redo()}>
          <Redo />
        </button>
        <button class="icon-btn" aria-label="Deselect" data-tip="Deselect" onClick={onClose}>
          <Close />
        </button>
      </header>
      <Tabs shown={shown} active={active.id} counts={counts} onTab={switchTab} />
      <div class={`body-wrap${more ? ' fade-bottom' : ''}`}>
      <div class="panel-body" role="tabpanel" data-section={active.id} ref={body} onScroll={measure}>
        {active.id === 'Layout' ? (
          // One flow: size sits under direction, spacing under gap.
          <>
            <LayoutBody size={has('Size')} spacing={has('Spacing')} />
            <AddRow missing={has('Spacing') ? [] : ['Spacing']} onAdd={add} />
          </>
        ) : (
          <>
            {active.categories.filter(has).map((c, i) => {
              const Body = BODIES[c]
              return (
                <div class={i ? 'pgroup' : undefined} key={c}>
                  <Body autoOpen={justAdded === c} onRemove={() => remove(c)} />
                </div>
              )
            })}
            <AddRow
              missing={active.categories.filter((c) => !has(c) && ADDABLE[c])}
              onAdd={add}
              lead={!active.categories.some(has)}
            />
          </>
        )}
      </div>
      <button
        class={`scroll-more${more ? ' show' : ''}`}
        data-scroll-more
        aria-label="Scroll down"
        tabIndex={more ? 0 : -1}
        aria-hidden={!more}
        onClick={() => body.current?.scrollBy({ top: body.current.clientHeight * 0.8, behavior: 'smooth' })}
      >
        <Glyph name="arrow-down" />
      </button>
      </div>
      {footer}
    </section>
  )
}

// Layout

function LayoutBody({ size, spacing: showSpacing }: { size: boolean; spacing: boolean }) {
  const ed = useEditor()
  const display = ed.value('display')
  const flex = isFlex(display)
  const grid = isGrid(display)
  const direction = ed.value('flex-direction')
  const column = flex && direction.startsWith('column')
  const reversed = direction.endsWith('reverse')
  const spacing = measureSiblingSpacing(ed.el)
  // The element's own gap, if it has two or more items to space; otherwise the
  // gap of the wrapper laying out its content (a button's label and arrow).
  const inner = gapApplies(ed.el) ? null : innerLayout(ed.el)
  const gapOwner: Owner = inner ? 'inner' : 'self'
  const gaps = gapApplies(ed.el) ? gapProperties(ed.el) : inner ? gapProperties(inner) : []

  return (
    <>
      <Row label="Display" props={['display']}>
        <SelectField property="display" options={optionsOf('display')} />
      </Row>
      {flex && (
        <Row
          label="Direction"
          props={['flex-direction']}
          note={
            // With one item there's nothing to stack: say so instead of silently doing nothing.
            layoutItems(ed.el) < 2
              ? `One item inside, so direction changes nothing you can see.${
                  selectableChild(ed.el) ? ` Press Enter to select the ${shortName(selectableChild(ed.el)!)} that holds the content.` : ''
                }`
              : undefined
          }
        >
          <SegField
            property="flex-direction"
            value={column ? 'column' : 'row'}
            options={[
              // Column first, like Figma's auto layout.
              { value: 'column', label: 'Column', icon: 'arrow-down' },
              { value: 'row', label: 'Row', icon: 'arrow-right' },
            ]}
            onValue={(v) => ed.set('flex-direction', 'self', reversed ? `${v}-reverse` : v)}
          />
          <button
            class={`icon-btn flat${reversed ? ' on' : ''}`}
            aria-label="Reverse"
            aria-pressed={reversed}
            data-tip="Reverse"
            onClick={() => ed.set('flex-direction', 'self', `${column ? 'column' : 'row'}${reversed ? '' : '-reverse'}`)}
          >
            <Glyph name="swap" style={{ transform: column ? 'rotate(90deg)' : undefined }} />
          </button>
        </Row>
      )}
      {size && <SizeBody />}
      {(flex || grid) && (
        <>
          <Row label="Align" props={['align-items']}>
            <SegField
              property="align-items"
              options={optionsOf('align-items')}
              // Cross axis turns with direction: start is the top for rows, the left for columns.
              iconStyle={{ transform: column ? 'rotate(-90deg)' : undefined }}
            />
          </Row>
          <Row label="Distribute" props={['justify-content']}>
            <SelectField
              property="justify-content"
              value={aliased('justify-content', ed.value('justify-content'))}
              options={DISTRIBUTE}
            />
          </Row>
        </>
      )}
      {flex && (
        <Row label="Wrap" props={['flex-wrap']}>
          <SegField
            property="flex-wrap"
            options={[
              { value: 'nowrap', label: 'No' },
              { value: 'wrap', label: 'Yes' },
            ]}
          />
        </Row>
      )}
      {(gaps.length > 0 || gapBetween(spacing)) && <GapRow gaps={gaps} owner={gapOwner} />}
      {showSpacing && <SpacingBody />}
    </>
  )
}

/**
 * Underline tabs that scroll sideways. Edges fade where there's more to
 * scroll. Mouse users scroll with the wheel (vertical wheel maps to
 * sideways) or by dragging the bar; touch scrolls natively.
 */
function Tabs({
  shown,
  active,
  counts,
  onTab,
}: {
  shown: TabDef[]
  active: string
  counts: Map<string, number>
  onTab(id: string): void
}) {
  const ref = useRef<HTMLElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })
  const dragged = useRef(false)
  const measure = () => {
    const el = ref.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    if (left !== fade.left || right !== fade.right) setFade({ left, right })
  }
  useLayoutEffect(measure)
  // Keep the active tab in view, scrolling only the tab bar.
  useEffect(() => {
    const el = ref.current
    const t = el?.querySelector<HTMLElement>('.tab.on')
    if (!el || !t) return
    if (t.offsetLeft < el.scrollLeft) el.scrollLeft = t.offsetLeft - 16
    else if (t.offsetLeft + t.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = t.offsetLeft + t.offsetWidth - el.clientWidth + 16
  }, [active])

  const onWheel = (e: JSX.TargetedWheelEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = e.currentTarget
    const startX = e.clientX
    const startLeft = el.scrollLeft
    dragged.current = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      if (!dragged.current && Math.abs(dx) < 4) return
      if (!dragged.current) el.setPointerCapture(ev.pointerId)
      dragged.current = true
      el.scrollLeft = startLeft - dx
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

  return (
    <nav
      ref={ref}
      class={`tabs${fade.left ? ' fade-left' : ''}${fade.right ? ' fade-right' : ''}`}
      role="tablist"
      aria-label="Categories"
      onScroll={measure}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
    >
      {shown.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          class={`tab${t.id === active ? ' on' : ''}${counts.get(t.id) ? ' has-count' : ''}`}
          data-category={t.id}
          onClick={() => {
            // A drag to scroll ends with a click; it shouldn't switch tabs.
            if (dragged.current) return void (dragged.current = false)
            onTab(t.id)
          }}
        >
          {t.label}
          {counts.get(t.id) ? <span class="tab-count">{counts.get(t.id)}</span> : null}
        </button>
      ))}
    </nav>
  )
}

/**
 * Whether the space to the siblings involves a real gap property, the parent's.
 * Space made by margins or by justify content is not a gap: margins are edited
 * in the Margin row, and Gap doesn't show for them at all.
 */
function gapBetween(spacing: SiblingSpacing | null): boolean {
  const s = spacing?.source
  return !!s && (s.kind === 'parent-gap' || (s.kind === 'mixed' && s.parts[0].startsWith('parent')))
}

/**
 * Gap, in one row: the element's own gap ("Inside") and the parent's gap to
 * its siblings ("Between"). The note under the row names the owner.
 */
function GapRow({ gaps, owner = 'self' }: { gaps: string[]; owner?: Owner }) {
  const ed = useEditor()
  const spacing = measureSiblingSpacing(ed.el)
  const s = spacing?.source
  const inside = <Glyph name="gap-inside" />
  const between = <Glyph name="gap-between" />
  const betweenTip = 'Gap between siblings'

  let sibling = null
  let note: string | undefined
  let parentProps: string[] = []
  if (spacing && s?.kind === 'parent-gap') {
    parentProps = [s.property]
    note = `Between is set on the parent, affects all ${s.count}`
    sibling = (
      <div data-sibling-gap="parent">
        <NumberField property={s.property} owner="parent" prefix={between} tip={betweenTip} units={BOX} min={0} />
      </div>
    )
  } else if (spacing && s?.kind === 'mixed' && gapBetween(spacing)) {
    note = `Between is made of ${s.parts.join(' and ')}`
    sibling = (
      <div data-sibling-gap="readonly">
        <ReadOnly value={`${spacing.distance}px`} prefix={between} tip={betweenTip} />
      </div>
    )
  }
  const cells = gaps.length + (sibling ? 1 : 0)
  return (
    <Row label="Gap" props={gaps} owner={owner} parentProps={parentProps} note={note}>
      <div class="grid2" style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
        {gaps.map((p) => (
          <NumberField
            key={p}
            property={p}
            owner={owner}
            prefix={inside}
            tip={p === 'gap' ? 'Gap inside this element' : p === 'row-gap' ? 'Row gap inside this element' : 'Column gap inside this element'}
            units={BOX}
            min={0}
          />
        ))}
        {sibling}
      </div>
    </Row>
  )
}

// Size: Fixed, Hug, Fill

function SizeBody() {
  const ed = useEditor()
  const extra = (sectionsFor('Size', ed.el)[0]?.properties ?? []).filter((p) => p.startsWith('min') || p.startsWith('max'))
  return (
    <>
      <SizeRow axis="width" />
      <SizeRow axis="height" />
      {extra.map((p) => (
        <Row key={p} label={specFor(p).label} props={[p]}>
          <NumberField property={p} units={['px', '%', 'rem']} keywords={[p.startsWith('max') ? 'none' : 'auto']} min={0} />
        </Row>
      ))}
    </>
  )
}

function SizeRow({ axis }: { axis: SizeAxis }) {
  const ed = useEditor()
  // Before values are taken while the element is untouched.
  if (!ed.store.list().some((c) => c.targets.includes(ed.el))) rememberSizeBefore(ed.el, true)
  const info = sizeInfo(ed.el, axis)
  // A pending edit says what the user chose; measuring can't tell a fixed
  // 56px from content that happens to be 56px wide.
  const grow = ed.changed('flex-grow')
  const own = ed.changed(axis)
  const mode: SizeMode =
    grow && parseFloat(grow.after) > 0
      ? 'fill'
      : own
        ? own.after === 'fit-content'
          ? 'hug'
          : own.after === '100%' || own.after === 'auto'
            ? 'fill'
            : 'fixed'
        : info.mode
  const fixedValue = ed.value(axis)
  const fixed = mode === 'fixed'
  return (
    <Row label={axis === 'width' ? 'Width' : 'Height'} props={sizeProperties(ed.el, axis)}>
      <NumberField
        property={axis}
        prefix={axis === 'width' ? 'W' : 'H'}
        tip={axis === 'width' ? 'Width' : 'Height'}
        units={['px', '%', 'rem', 'em', axis === 'width' ? 'vw' : 'vh']}
        min={0}
        // Hug and Fill show the rendered size; typing a number makes it Fixed.
        value={fixed && !/fit-content|auto/.test(fixedValue) ? fixedValue : `${Math.round(info.px)}px`}
        muted={!fixed}
        onValue={(v, c) => ed.setSize(axis, 'fixed', v, c)}
      />
      <SelectField
        property={`${axis}-mode`}
        options={SIZE_MODES.map((o) =>
          o.value === 'fill' && !info.canFill
            ? { ...o, disabled: true, label: `Fill, parent has no set ${axis}` }
            : o,
        )}
        value={mode}
        onValue={(m) => ed.setSize(axis, m as SizeMode)}
      />
    </Row>
  )
}

// Spacing, radius and border widths share the side group pattern.

const SIDE_GLYPHS = ['side-top', 'side-right', 'side-bottom', 'side-left']
const CORNER_GLYPHS = ['corner-tl', 'corner-tr', 'corner-br', 'corner-bl']
const SIDE_TIPS = ['Top', 'Right', 'Bottom', 'Left']
const CORNER_TIPS = ['Top left', 'Top right', 'Bottom right', 'Bottom left']

function Sides({
  group,
  label,
  units = BOX,
  keywords,
  min,
  only,
}: {
  group: string
  label: string
  units?: string[]
  keywords?: string[]
  min?: number
  /** Restrict to these properties (inline boxes ignore vertical margins). */
  only?: { collapsed: string[]; expanded: string[] }
}) {
  const ed = useEditor()
  const g = GROUPS[group]
  const live = g.sides.map((p) => ed.value(p))
  const canCollapse = g.inline ? live[0] === live[2] && live[1] === live[3] : live.every((v) => v === live[0])
  const [open, setOpen] = useState(!canCollapse)
  const expanded = open || !canCollapse
  const corners = group === 'border-radius'
  // Corners read as the box they shape: top left, top right, then bottom left,
  // bottom right underneath (CSS lists them clockwise, ending bottom right, bottom left).
  const [tl, tr, br, bl] = g.sides
  const fields = only
    ? expanded
      ? only.expanded
      : only.collapsed
    : expanded
      ? corners
        ? [tl, tr, bl, br]
        : g.sides
      : g.inline
        ? [g.inline, g.block!]
        : [g.all]
  const all = [g.all, ...(g.inline ? [g.inline, g.block!] : []), ...g.sides]

  const glyph = (p: string) => {
    if (p === g.inline) return { name: 'pad-x', tip: 'Horizontal' }
    if (p === g.block) return { name: 'pad-y', tip: 'Vertical' }
    if (p === g.all) return { name: corners ? 'corner-tl' : 'side-all', tip: 'All' }
    const i = g.sides.indexOf(p)
    return corners ? { name: CORNER_GLYPHS[i], tip: CORNER_TIPS[i] } : { name: SIDE_GLYPHS[i], tip: SIDE_TIPS[i] }
  }

  return (
    <Row label={label} props={all}>
      <div class={`grid2${fields.length === 1 ? ' one' : ''}`}>
        {fields.map((p) => {
          const gl = glyph(p)
          return (
            <NumberField
              key={p}
              property={p}
              prefix={<Glyph name={gl.name} />}
              tip={`${label} ${gl.tip.toLowerCase()}`}
              units={units}
              keywords={keywords}
              min={min}
            />
          )
        })}
      </div>
      <button
        class={`icon-btn flat${expanded ? ' on' : ''}`}
        aria-label={corners ? 'Individual corners' : 'Individual sides'}
        aria-pressed={expanded}
        data-tip={canCollapse ? (corners ? 'Individual corners' : 'Individual sides') : 'Sides differ'}
        disabled={!canCollapse}
        onClick={() => setOpen(!open)}
      >
        <Glyph name={corners ? 'corners' : 'sides'} />
      </button>
    </Row>
  )
}

function SpacingBody() {
  const ed = useEditor()
  const inline = ed.value('display') === 'inline'
  return (
    <>
      <Sides group="padding" label="Padding" min={0} />
      <Sides
        group="margin"
        label="Margin"
        keywords={['auto']}
        only={inline ? { collapsed: ['margin-inline'], expanded: ['margin-right', 'margin-left'] } : undefined}
      />
    </>
  )
}

function ShapeBody() {
  return <Sides group="border-radius" label="Radius" min={0} />
}

function FillBody({ autoOpen }: { autoOpen?: boolean }) {
  return (
    <>
      <Row label="Fill" props={['background-color']}>
        <ColorField property="background-color" autoOpen={autoOpen} />
      </Row>
      <Row label="Opacity" props={['opacity']}>
        <NumberField property="opacity" percent units={['']} min={0} max={100} prefix={<Glyph name="opacity" />} tip="Opacity" />
      </Row>
    </>
  )
}

const BORDER_PROPS = [GROUPS['border-width'], GROUPS['border-style'], GROUPS['border-color']].flatMap((g) => [g.all, ...g.sides])

/** Did the element have a visible border before any edit? */
const hadBorder = (el: Element) =>
  ['top', 'right', 'bottom', 'left'].some(
    (s) => parseFloat(baseline(el, `border-${s}-width`)) > 0 && baseline(el, `border-${s}-style`) !== 'none',
  )

function BorderBody({ onRemove }: { onRemove?: () => void }) {
  const ed = useEditor()
  const pending = BORDER_PROPS.filter((p) => ed.changed(p))

  // Removed: one row that says so; its reset brings the border back.
  if (!hasBorder(ed.el) && pending.length && hadBorder(ed.el)) {
    return (
      <Row label="Border" props={pending}>
        <span class="removed" data-border-removed>
          Removed
        </span>
      </Row>
    )
  }

  // A border can be absent (unlike a radius, which is just 0), so it can be removed.
  // One that only Courier added is simply undone; one from the code becomes border-style none.
  const remove = () => {
    if (!hadBorder(ed.el)) {
      ed.resetMany(pending)
      onRemove?.()
      return
    }
    ed.store.batch(() => {
      ed.resetMany(pending)
      ed.set('border-style', 'self', 'none')
    })
  }

  const props = sectionsFor('Border', ed.el)[0]?.properties ?? []
  const colors = props.filter((p) => p.endsWith('color'))
  const styles = props.filter((p) => p.endsWith('style'))
  return (
    <>
      {colors.map((p, i) => (
        // Inside Appearance, the first border row names the group.
        <Row key={p} label={p === 'border-color' ? 'Border' : specFor(p).label} props={[p]}>
          <ColorField property={p} />
          {i === 0 && (
            <button class="icon-btn flat" aria-label="Remove border" data-tip="Remove border" data-remove-border onClick={remove}>
              <Glyph name="minus" />
            </button>
          )}
        </Row>
      ))}
      <Sides group="border-width" label="Width" units={['px', 'rem', 'em']} min={0} />
      {styles.map((p) => (
        <Row key={p} label={specFor(p).label} props={[p]}>
          <SelectField property={p} options={optionsOf('border-style')} />
        </Row>
      ))}
    </>
  )
}

function TextBody() {
  const ed = useEditor()
  // The weight note depends on which font files have loaded; redraw when more arrive.
  const [, fontsChanged] = useState(0)
  useEffect(() => {
    const update = () => fontsChanged((n) => n + 1)
    document.fonts.addEventListener('loadingdone', update)
    return () => document.fonts.removeEventListener('loadingdone', update)
  }, [])
  // Any weight can be typed; whether it renders exactly depends on the font
  // files the page loads. Static fonts snap to the nearest one they have.
  const fonts = fontWeights(ed.value('font-family'))
  const wanted = Number(ed.value('font-weight'))
  const shown = fonts && !fonts.variable ? renderedWeight(wanted, fonts.weights) : wanted
  const list = fonts?.weights.join(', ').replace(/, (\d+)$/, ' and $1')
  const weightNote = shown !== wanted ? `${fonts!.family} loads ${list}, so ${wanted} shows as ${shown}` : undefined
  const props = new Set(sectionsFor('Text', ed.el)[0]?.properties ?? [])
  return (
    <>
      <Row label="Color" props={['color']}>
        <ColorField property="color" />
      </Row>
      <Row label="Font" props={['font-family']}>
        <FontField />
      </Row>
      <Row label="Weight" props={['font-weight']} note={weightNote}>
        <NumberField property="font-weight" units={['']} suffix="" min={1} max={1000} step={100} presets={WEIGHTS} />
      </Row>
      <Row label="Size" props={['font-size']}>
        <NumberField property="font-size" prefix={<Glyph name="font-size" />} tip="Font size" units={BOX} min={0} />
      </Row>
      <Row label="Line" props={['line-height', 'letter-spacing']}>
        <div class="grid2">
          <NumberField
            property="line-height"
            prefix={<Glyph name="line-height" />}
            tip="Line height"
            units={['', 'px', 'em', '%']}
            keywords={['normal']}
            min={0}
            // Unitless line heights move in tenths.
            step={/^[\d.]+$/.test(ed.value('line-height')) ? 0.1 : 1}
          />
          <NumberField
            property="letter-spacing"
            prefix={<Glyph name="letter-spacing" />}
            tip="Letter spacing"
            units={['px', 'em', 'rem']}
            keywords={['normal']}
            step={0.1}
          />
        </div>
      </Row>
      {props.has('text-align') && (
        <Row label="Align" props={['text-align']}>
          <SegField property="text-align" options={optionsOf('text-align')} />
        </Row>
      )}
      <Row label="Case" props={['text-transform']}>
        <SegField property="text-transform" options={optionsOf('text-transform')} />
      </Row>
    </>
  )
}

function IconBody() {
  const ed = useEditor()
  const props = sectionsFor('Icon', ed.el)[0]?.properties ?? []
  const n = ed.icons.length * (ed.scope === 'all' ? ed.matches.length : 1)
  // Icons keep their proportions by default, so W and H move together.
  const [linked, setLinked] = useState(true)
  const sizeOf = (axis: 'width' | 'height') => {
    const r = ed.primary('icon')?.getBoundingClientRect()
    return r ? (axis === 'width' ? r.width : r.height) : 0
  }
  // An SVG without a viewBox draws at its original size whatever CSS says, so
  // resizing it also adds a viewBox for that original size; the export tells
  // the agent to add the same one. Remembered once, before any edit.
  const svg = ed.primary('icon')
  const needsViewBox = svg instanceof SVGSVGElement && !svg.hasAttribute('viewBox') && !ed.changed('attr:viewBox', 'icon')
  const originalBox = (() => {
    if (!(svg instanceof SVGSVGElement)) return null
    const w = parseFloat(svg.getAttribute('width') ?? '') || parseFloat(baseline(svg, 'width'))
    const h = parseFloat(svg.getAttribute('height') ?? '') || parseFloat(baseline(svg, 'height'))
    return w && h ? `0 0 ${w} ${h}` : null
  })()
  const addedViewBox = !!ed.changed('attr:viewBox', 'icon')
  const linkedSet = (axis: 'width' | 'height') => (v: string, coalesce?: boolean) => {
    const other = axis === 'width' ? 'height' : 'width'
    const n = parseLength(v)
    const ratio = sizeOf(axis) ? sizeOf(other) / sizeOf(axis) : 1
    const values: Record<string, string> = { [axis]: v }
    if (linked && n) values[other] = `${Math.round(n.num * ratio * 100) / 100}${n.unit}`
    // Kept in every edit once added, so a run of keystrokes stays one undo step.
    if ((needsViewBox || addedViewBox) && originalBox) values['attr:viewBox'] = originalBox
    ed.setMany(values, 'icon', coalesce)
  }
  return (
    <>
      {n > 1 && <p class="pnote lead">Edits all {n} matching icons</p>}
      {(needsViewBox || addedViewBox) && (
        <p class="pnote lead" data-viewbox-note>
          This icon has no viewBox, so resizing alone would not scale the drawing. Courier adds viewBox {originalBox} and the export
          tells the agent to do the same.
        </p>
      )}
      <Row label="Size" props={['width', 'height', 'attr:viewBox']} owner="icon">
        <div class="grid2">
          <NumberField property="width" owner="icon" prefix="W" tip="Icon width" units={['px', 'rem', 'em']} min={0} onValue={linkedSet('width')} />
          <NumberField property="height" owner="icon" prefix="H" tip="Icon height" units={['px', 'rem', 'em']} min={0} onValue={linkedSet('height')} />
        </div>
        <button
          class={`icon-btn flat${linked ? ' on' : ''}`}
          aria-label="Keep proportions"
          aria-pressed={linked}
          data-tip={linked ? 'Proportions kept' : 'Keep proportions'}
          onClick={() => setLinked(!linked)}
        >
          <Glyph name="sides" />
        </button>
      </Row>
      <Row label="Color" props={['color']} owner="icon">
        <ColorField property="color" owner="icon" />
      </Row>
      {props.includes('stroke-width') && (
        <Row label="Stroke" props={['stroke-width']} owner="icon">
          <NumberField property="stroke-width" owner="icon" prefix={<Glyph name="stroke" />} tip="Stroke width" units={['px']} min={0} step={0.1} />
        </Row>
      )}
    </>
  )
}

/** Sections that can be added to an element that doesn't use them yet. */
const ADDABLE: Partial<Record<Category, string>> = { Fill: 'Fill', Shape: 'Radius', Border: 'Border', Spacing: 'Spacing' }

function AddRow({ missing, onAdd, lead }: { missing: Category[]; onAdd(c: Category): void; lead?: boolean }) {
  if (!missing.length) return null
  return (
    <div class={`add-row${lead ? ' lead' : ''}`} data-add-row>
      {missing.map((c) => (
        <button key={c} class="add-btn" data-add={c} onClick={() => onAdd(c)}>
          <Glyph name="plus" />
          {ADDABLE[c]}
        </button>
      ))}
    </div>
  )
}

const BODIES: Record<Category, (props: { autoOpen?: boolean; onRemove?: () => void }) => ComponentChildren> = {
  // The Layout tab renders LayoutBody directly, with size and spacing woven in.
  Layout: () => null,
  Size: () => null,
  Spacing: () => null,
  Shape: ShapeBody,
  Fill: FillBody,
  Border: BorderBody,
  Text: TextBody,
  Icon: IconBody,
  Other: () => null,
}
