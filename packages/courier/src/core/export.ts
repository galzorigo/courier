// The plain text export an agent can follow line by line.

import type { Change } from './changes'
import { elementId } from './changes'
import { describe, shortName, type ElementDescription, type SourceResolver } from './describe'
import { CATEGORIES, type Category } from './properties'
import { findMatches } from './scope'

export interface ExportContext {
  url?: string
  viewport?: { width: number; height: number }
  resolveSource?: SourceResolver
}

interface Block {
  kind: 'all' | 'this' | 'parent'
  anchor: Element
  members: Element[]
  self: Change[]
  icon: Change[]
  inner: Change[]
}

const ARROW = '→'

function sourceLine(d: ElementDescription): string {
  // Filled in by a SourceResolver once file:line detection lands.
  return d.source
    ? `Source: ${d.source.file}:${d.source.line}${d.source.column ? ':' + d.source.column : ''}`
    : 'Source: not detected (locate it with the selector above)'
}

function identity(d: ElementDescription, selector = d.selector): string[] {
  const lines = [`Selector: ${selector}`]
  // Utility class codebases: the exact class string is what to search for.
  if (d.classes) lines.push(`Classes: ${d.classes}`)
  if (d.component) lines.push(`Component: ${d.component}`)
  lines.push(sourceLine(d))
  return lines
}

const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`
const line = (c: Change, indent = '  ') =>
  c.property.startsWith('attr:')
    ? `${indent}${c.property.slice(5)} attribute: ${c.before} ${ARROW} ${c.after}${
        c.property === 'attr:viewBox' ? ' (add it in the markup, or the icon draws at its old size inside the new box)' : ''
      }`
    : `${indent}${c.property}: ${c.before} ${ARROW} ${c.after}`

/** True if any of the element's classes is also used by another element. */
function sharesClass(el: Element): boolean {
  return [...el.classList].some((c) => {
    try {
      return el.ownerDocument.querySelectorAll('.' + CSS.escape(c)).length > 1
    } catch {
      return false
    }
  })
}

function summary(changes: Change[]): string {
  const counts = new Map<Category, number>()
  for (const c of changes) counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  const parts = [...CATEGORIES, 'Other' as Category]
    .filter((c) => counts.has(c))
    .map((c) => `${c} ${counts.get(c)}`)
  return `${changes.length} (${parts.join(', ')})`
}

export function buildExport(changes: Change[], ctx: ExportContext = {}): string {
  const blocks = new Map<string, Block>()
  for (const c of changes) {
    let key: string
    let kind: Block['kind']
    if (c.owner === 'parent') {
      kind = 'parent'
      key = `parent|${elementId(c.anchor)}`
    } else if (c.scope === 'all') {
      kind = 'all'
      // Keyed by the matched set, so edits made from different members merge.
      key = `all|${c.members.map(elementId).sort((a, b) => a - b).join(',')}`
    } else {
      kind = 'this'
      key = `this|${elementId(c.anchor)}`
    }
    let block = blocks.get(key)
    if (!block) blocks.set(key, (block = { kind, anchor: c.anchor, members: c.members, self: [], icon: [], inner: [] }))
    ;(c.owner === 'icon' ? block.icon : c.owner === 'inner' ? block.inner : block.self).push(c)
  }

  const order: Block['kind'][] = ['all', 'this', 'parent']
  const sorted = [...blocks.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))

  const out: string[] = ['# Style changes from Courier']
  if (ctx.url) out.push(`Page: ${ctx.url}`)
  if (ctx.viewport) out.push(`Viewport: ${ctx.viewport.width}×${ctx.viewport.height}`)
  out.push(`Changes: ${summary(changes)}`)
  out.push(
    '',
    'Apply exactly these values. They were picked visually in the browser, so do not round them, substitute others, or change anything else.',
    'Values are computed CSS. If the project uses design tokens, Tailwind classes or CSS variables, use the one that equals the new value, otherwise use the raw value.',
  )

  for (const b of sorted) {
    out.push('')
    const d = describe(b.anchor, ctx.resolveSource)
    if (b.kind === 'all') {
      out.push(`## Scope: ALL ${b.members.length} matching elements (${d.short})`)
      const texts = b.members.map((m) => describe(m).text).filter(Boolean)
      if (texts.length) out.push(`Elements: ${texts.map(quote).join(', ')}`)
      // Drop positions so one selector covers every match (siblings or the same spot in repeated cards).
      out.push(...identity(d, d.selector.replace(/:nth-(?:child|of-type)\(\d+\)/g, '')))
      out.push(
        `These elements share one style. Change the shared rule or component so all ${b.members.length} update together.`,
      )
    } else if (b.kind === 'this') {
      out.push(`## Scope: ONLY this element (${d.short}${d.text ? `, text ${quote(d.text)}` : ''})`)
      out.push(...identity(d))
      const matches = findMatches(b.anchor).length
      if (matches > 1 || sharesClass(b.anchor)) {
        out.push(
          'Do not edit the shared component or class. Override at this usage only, for example with a modifier class or a prop at this call site.',
        )
      } else {
        out.push('Change only this element.')
      }
    } else {
      out.push(`## Spacing owner: parent ${d.short}`)
      out.push(...identity(d))
      out.push(
        `This sets the spacing between all ${b.members.length} children. Change it on the parent, not on the children.`,
      )
    }
    for (const c of b.self) out.push(line(c))
    if (b.inner.length) {
      const where = b.kind === 'all' ? 'inside each matching element' : 'inside this element'
      out.push(`  On the ${shortName(b.inner[0].targets[0])} that wraps the content ${where} (not on the element itself):`)
      for (const c of b.inner) out.push(line(c, '    '))
    }
    if (b.icon.length) {
      const sample = b.icon[0].targets[0]
      const count = Math.max(...b.icon.map((c) => c.targets.length))
      const where = b.kind === 'all' ? `across all ${b.members.length} matching elements` : 'inside this element'
      out.push(
        count > 1
          ? `  Icons: ${shortName(sample)}, ${count} matching icons ${where}. They share one style, so change the shared icon rule or component:`
          : `  Icon: ${shortName(sample)} ${where}:`,
      )
      for (const c of b.icon) out.push(line(c, '    '))
    }
  }
  return out.join('\n') + '\n'
}
