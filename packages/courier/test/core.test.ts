import { beforeEach, describe, expect, it } from 'vitest'
import {
  ChangeStore,
  GROUPS,
  buildExport,
  categorize,
  collapseGroup,
  findMatches,
  parseLength,
  roundLengths,
  selectorPath,
  shortName,
  toHex,
} from '../src/core'

describe('categorize', () => {
  it('looks properties up in the table', () => {
    expect(categorize('display')).toBe('Layout')
    expect(categorize('padding-inline')).toBe('Spacing')
    expect(categorize('border-top-left-radius')).toBe('Shape')
    expect(categorize('background-color')).toBe('Fill')
    expect(categorize('border-color')).toBe('Border')
    expect(categorize('letter-spacing')).toBe('Text')
  })
  it('falls back to Other', () => {
    expect(categorize('transform')).toBe('Other')
  })
})

describe('collapseGroup', () => {
  const read = (values: Record<string, string>) => (p: string) => values[p]
  it('collapses four equal sides to the shorthand', () => {
    const v = { 'padding-top': '8px', 'padding-right': '8px', 'padding-bottom': '8px', 'padding-left': '8px' }
    expect(collapseGroup(GROUPS.padding, read(v))).toEqual(['padding'])
  })
  it('uses inline and block pairs when they match', () => {
    const v = { 'padding-top': '8px', 'padding-right': '12px', 'padding-bottom': '8px', 'padding-left': '12px' }
    expect(collapseGroup(GROUPS.padding, read(v))).toEqual(['padding-inline', 'padding-block'])
  })
  it('falls back to every side', () => {
    const v = { 'padding-top': '1px', 'padding-right': '2px', 'padding-bottom': '3px', 'padding-left': '4px' }
    expect(collapseGroup(GROUPS.padding, read(v))).toHaveLength(4)
  })
})

describe('values', () => {
  it('converts colors to hex', () => {
    expect(toHex('rgb(238, 238, 238)')).toBe('#EEEEEE')
    expect(toHex('rgba(0, 0, 0, 0.5)')).toBe('#00000080')
    expect(toHex('rgba(0, 0, 0, 0)')).toBe('#00000000')
    expect(toHex('#abc')).toBe('#AABBCC')
    expect(toHex('rgb(226 232 240 / 1)')).toBe('#E2E8F0')
  })
  it('rounds long decimals', () => {
    expect(roundLengths('33.59375px')).toBe('33.59px')
    expect(roundLengths('8px 12.5px')).toBe('8px 12.5px')
  })
  it('parses lengths', () => {
    expect(parseLength('24px')).toEqual({ num: 24, unit: 'px' })
    expect(parseLength('1.5')).toEqual({ num: 1.5, unit: '' })
    expect(parseLength('-0.5em')).toEqual({ num: -0.5, unit: 'em' })
    expect(parseLength('auto')).toBeNull()
  })
})

function chips() {
  document.body.innerHTML = `
    <main>
      <div class="links">
        <a class="link-chip">X</a>
        <a class="link-chip">GitHub</a>
        <a class="link-chip">Mail</a>
        <a class="link-chip is-featured">LinkedIn</a>
      </div>
    </main>`
  return [...document.querySelectorAll('a')] as HTMLElement[]
}

describe('ChangeStore', () => {
  let store: ChangeStore
  let els: HTMLElement[]
  beforeEach(() => {
    store = new ChangeStore()
    els = chips()
  })
  const set = (el: HTMLElement, property: string, value: string, before = '8px', targets = [el]) =>
    store.set({ anchor: el, scope: targets.length > 1 ? 'all' : 'this', owner: 'self', property, targets, members: targets, before, value })

  it('applies inline overrides and reverts them exactly', () => {
    els[0].setAttribute('style', 'color: red')
    set(els[0], 'padding', '12px')
    expect(els[0].style.getPropertyValue('padding-top')).toBe('12px')
    expect(els[0].style.getPropertyPriority('padding-top')).toBe('important')
    store.clear()
    expect(els[0].getAttribute('style')).toBe('color: red;')
    set(els[1], 'padding', '12px')
    store.clear()
    expect(els[1].hasAttribute('style')).toBe(false)
  })

  it('removes a change set back to its before value', () => {
    set(els[0], 'padding', '12px')
    expect(store.size).toBe(1)
    set(els[0], 'padding', '8px')
    expect(store.size).toBe(0)
  })

  it('undoes, redoes and resets', () => {
    set(els[0], 'padding', '12px')
    set(els[0], 'gap', '4px', '6px')
    store.undo()
    expect(store.size).toBe(1)
    store.redo()
    expect(store.size).toBe(2)
    store.reset(store.list()[0].key)
    expect(store.list().map((c) => c.property)).toEqual(['gap'])
    expect(els[0].style.getPropertyValue('padding-top')).toBe('')
    store.undo()
    expect(store.size).toBe(2)
    expect(els[0].style.getPropertyValue('padding-top')).toBe('12px')
  })

  it('coalesces rapid edits to one field into one undo step', () => {
    store.set({ anchor: els[0], scope: 'this', owner: 'self', property: 'padding', targets: [els[0]], members: [els[0]], before: '8px', value: '9px' }, { coalesce: true })
    store.set({ anchor: els[0], scope: 'this', owner: 'self', property: 'padding', targets: [els[0]], members: [els[0]], before: '8px', value: '10px' }, { coalesce: true })
    expect(store.get(store.list()[0].key)!.after).toBe('10px')
    store.undo()
    expect(store.size).toBe(0)
    expect(store.canUndo).toBe(false)
  })

  it('applies all scope changes to every target and counts badges per category', () => {
    set(els[0], 'padding', '12px', '8px', els.slice(0, 3))
    for (const el of els.slice(0, 3)) expect(el.style.getPropertyValue('padding-top')).toBe('12px')
    expect(els[3].hasAttribute('style')).toBe(false)
    expect(store.countByCategory(els[1]).get('Spacing')).toBe(1)
    expect(store.countByCategory(els[3]).size).toBe(0)
  })

  it('lets the newest change win where scopes overlap, and unwinds cleanly', () => {
    set(els[0], 'padding', '12px', '8px', els.slice(0, 3))
    set(els[0], 'padding', '20px')
    expect(els[0].style.getPropertyValue('padding-top')).toBe('20px')
    expect(els[1].style.getPropertyValue('padding-top')).toBe('12px')
    store.undo()
    expect(els[0].style.getPropertyValue('padding-top')).toBe('12px')
  })
})

describe('describe', () => {
  it('builds readable selectors', () => {
    const els = chips()
    expect(shortName(els[3])).toBe('a.link-chip.is-featured')
    expect(selectorPath(els[1])).toBe('a.link-chip:nth-of-type(2)')
    expect(selectorPath(els[3])).toBe('a.link-chip.is-featured')
  })
})

describe('findMatches', () => {
  it('matches siblings with the same classes and styles', () => {
    const els = chips()
    expect(findMatches(els[0])).toEqual(els.slice(0, 3))
    expect(findMatches(els[3])).toEqual([els[3]])
  })
  it('excludes siblings whose computed styles differ', () => {
    const els = chips()
    els[2].style.color = 'rgb(255, 0, 0)'
    expect(findMatches(els[0])).toEqual(els.slice(0, 2))
  })
})

describe('buildExport', () => {
  it('groups changes by scope with identity and instructions', () => {
    const els = chips()
    const store = new ChangeStore()
    const all = els.slice(0, 3)
    store.set({ anchor: els[0], scope: 'all', owner: 'self', property: 'padding-inline', targets: all, members: all, before: '34px', value: '40px' })
    store.set({ anchor: els[0], scope: 'all', owner: 'self', property: 'border-radius', targets: all, members: all, before: '20px', value: '24px' })
    store.set({ anchor: els[3], scope: 'this', owner: 'self', property: 'background-color', targets: [els[3]], members: [els[3]], before: '#EEEEEE', value: '#E2E8F0' })
    const parent = els[0].parentElement!
    store.set({ anchor: parent, scope: 'this', owner: 'parent', property: 'gap', targets: [parent], members: els, before: '24px', value: '32px' })

    const text = buildExport(store.list(), { url: 'http://localhost:5173/', viewport: { width: 1274, height: 823 } })
    expect(text).toContain('Changes: 4 (Layout 1, Spacing 1, Shape 1, Fill 1)')
    expect(text).toContain('## Scope: ALL 3 matching elements (a.link-chip)')
    expect(text).toContain('Selector: a.link-chip\n')
    expect(text).toContain('  padding-inline: 34px → 40px\n  border-radius: 20px → 24px')
    expect(text).toContain('## Scope: ONLY this element (a.link-chip.is-featured, text "LinkedIn")')
    expect(text).toContain('Do not edit the shared component or class. Override at this usage only')
    expect(text).toContain('  background-color: #EEEEEE → #E2E8F0')
    expect(text).toContain('## Spacing owner: parent div.links')
    expect(text).toContain('between all 4 children')
    expect(text).toContain('  gap: 24px → 32px')
    expect(text).toContain('Source: not detected')
    // ALL before ONLY before spacing owner
    expect(text.indexOf('ALL 3')).toBeLessThan(text.indexOf('ONLY this'))
    expect(text.indexOf('ONLY this')).toBeLessThan(text.indexOf('Spacing owner'))
  })

  it('fills the source slot when a resolver is given', () => {
    const els = chips()
    const store = new ChangeStore()
    store.set({ anchor: els[3], scope: 'this', owner: 'self', property: 'color', targets: [els[3]], members: [els[3]], before: '#111111', value: '#000000' })
    const text = buildExport(store.list(), { resolveSource: () => ({ file: 'src/App.tsx', line: 12, column: 5 }) })
    expect(text).toContain('Source: src/App.tsx:12:5')
  })
})

describe('ChangeStore save and batch', () => {
  const input = (el: HTMLElement, property: string, value: string, before = '8px') => ({
    anchor: el, scope: 'this' as const, owner: 'self' as const, property, targets: [el], members: [el], before, value,
  })

  it('reverts only edits made since the last save, as one undo step', () => {
    const [a] = chips()
    const store = new ChangeStore()
    store.set(input(a, 'padding', '12px'))
    store.save()
    expect(store.dirty).toBe(false)
    expect(store.savedCount).toBe(1)
    store.set(input(a, 'gap', '4px', '6px'))
    store.set(input(a, 'padding', '20px'))
    expect(store.dirty).toBe(true)
    store.revertUnsaved()
    expect(store.dirty).toBe(false)
    expect(store.list().map((c) => `${c.property} ${c.after}`)).toEqual(['padding 12px'])
    expect(a.style.getPropertyValue('padding-top')).toBe('12px')
    store.undo()
    expect(store.size).toBe(2)
  })

  it('records a batch as a single undo step', () => {
    const [a] = chips()
    const store = new ChangeStore()
    store.batch(() => {
      store.set(input(a, 'flex-grow', '1', '0'))
      store.set(input(a, 'flex-basis', '0%', 'auto'))
    })
    expect(store.size).toBe(2)
    store.undo()
    expect(store.size).toBe(0)
    expect(a.hasAttribute('style')).toBe(false)
  })

  it('clear forgets saved changes too', () => {
    const [a] = chips()
    const store = new ChangeStore()
    store.set(input(a, 'padding', '12px'))
    store.save()
    store.clear()
    expect(store.savedCount).toBe(0)
    expect(store.dirty).toBe(false)
  })
})

describe('findMatches across repeated containers', () => {
  it('matches the same element inside every copy of a card', () => {
    document.body.innerHTML = `
      <div class="steps">
        <article class="card"><h3>A</h3><p>one</p></article>
        <article class="card"><h3>B</h3><p>two</p></article>
        <article class="card"><h3>C</h3><p>three</p></article>
      </div>`
    const ps = [...document.querySelectorAll('p')]
    expect(findMatches(ps[1])).toEqual(ps)
    expect(findMatches(document.querySelector('h3')!)).toHaveLength(3)
  })
})

describe('persisting changes', () => {
  it('stores elements by position and finds them again, refusing a changed page', async () => {
    const { refOf, resolve, snapshot, restoreInto } = await import('../src/core')
    const els = chips()
    const ref = refOf(els[2])
    expect(resolve(ref)).toBe(els[2])

    const store = new ChangeStore()
    store.set({ anchor: els[0], scope: 'this', owner: 'self', property: 'padding', targets: [els[0]], members: [els[0]], before: '8px', value: '12px' })
    store.save()
    const stored = snapshot(store)
    expect(stored[0].saved).toBe(true)

    // Same page again: restored and applied.
    const fresh = chips()
    const next = new ChangeStore()
    expect(restoreInto(next, stored)).toEqual([])
    expect(fresh[0].style.getPropertyValue('padding-top')).toBe('12px')
    expect(next.savedCount).toBe(1)

    // Page changed: the element at that spot is a different kind, so it is reported.
    document.body.innerHTML = '<main><div class="links"><span class="other">X</span></div></main>'
    expect(restoreInto(new ChangeStore(), stored)).toHaveLength(1)
  })
})

describe('utility class codebases', () => {
  it('names elements by their meaningful classes and keeps the full class string for the export', async () => {
    const { utilityClassString } = await import('../src/core')
    document.body.innerHTML = `
      <section><div class="mx-auto max-w-6xl px-4 sm:px-6">
        <h1 class="mb-6 border-y text-5xl font-bold [border-image:linear-gradient(red,blue)1] md:text-6xl aos-init aos-animate">Hi</h1>
        <a class="btn group w-full bg-white hover:bg-gray-50">Go</a>
        <a class="btn group w-full bg-white hover:bg-gray-50">Go</a>
      </div></section>`
    const h1 = document.querySelector('h1')!
    const links = document.querySelectorAll('a')
    expect(shortName(h1)).toBe('h1')
    expect(shortName(links[0])).toBe('a.btn')
    expect(selectorPath(links[1])).toBe('a.btn:nth-of-type(2)')
    expect(utilityClassString(h1)).toContain('mb-6 border-y text-5xl')
    expect(utilityClassString(document.createElement('div'))).toBeNull()
  })
})
