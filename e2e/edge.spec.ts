import { expect, test, type Page } from '@playwright/test'

/** Pick from one of Courier's dropdown menus (they're not native selects). */
async function choose(button: import('@playwright/test').Locator, value: string) {
  await button.click()
  await button.locator('xpath=..').locator(`.choices [data-value="${value}"]`).click()
}

// Edge cases found by trying to break Courier. Fixtures are injected into the
// playground at runtime, so the page itself stays the plain landing page.

const o = (page: Page, s: string) => page.locator(`courier-overlay ${s}`)
const css = (page: Page, sel: string, prop: string, nth = 0) =>
  page.locator(sel).nth(nth).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
const chip = (page: Page, label: string) => page.locator('.link-chip', { hasText: new RegExp(`^${label}$`) })
const field = (page: Page, p: string) => o(page, `[data-property="${p}"]`)
const exported = async (page: Page) => {
  await o(page, '[aria-label="Copy all saved changes"]').click()
  return page.evaluate(() => navigator.clipboard.readText())
}

async function start(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await o(page, '[data-courier-launcher]').click()
  return errors
}

test('editing one element, then all matching, exports no contradiction', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await field(page, 'padding-inline').locator('input').fill('20')
  await o(page, '.check-row').click()
  await field(page, 'padding-inline').locator('input').fill('16')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('16px')
  const lines = (await exported(page)).split('\n').filter((l) => l.includes('padding-inline'))
  expect(lines).toEqual(['  padding-inline: 12px → 16px'])
})

test('editing a group from two of its members updates one change', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await o(page, '.check-row').click()
  await field(page, 'padding-inline').locator('input').fill('16')
  await chip(page, 'GitHub').click({ force: true })
  await expect(o(page, '[data-scope-all]')).toBeChecked()
  await expect(field(page, 'padding-inline').locator('input')).toHaveValue('16')
  await field(page, 'padding-inline').locator('input').fill('20')
  const text = await exported(page)
  expect(text).toContain('Changes: 1 (Spacing 1)')
  expect(text).toContain('  padding-inline: 12px → 20px')
})

test("the page's own inline style changes survive Courier edits and cancel", async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    const d = document.createElement('div')
    d.id = 'live'
    d.style.cssText = 'padding: 10px; background: rgb(255, 200, 200)'
    d.textContent = 'live box'
    document.querySelector('.hero')!.append(d)
  })
  await page.locator('#live').click({ force: true })
  await field(page, 'padding-inline').locator('input').fill('30')
  // The page sets its own style later, like React state would.
  await page.evaluate(() => ((document.getElementById('live') as HTMLElement).style.color = 'rgb(0, 0, 255)'))
  await field(page, 'padding-block').locator('input').fill('5')
  await expect.poll(() => css(page, '#live', 'color')).toBe('rgb(0, 0, 255)')
  await expect.poll(() => css(page, '#live', 'padding-left')).toBe('30px')
  await o(page, '[data-cancel]').click()
  await expect.poll(() => css(page, '#live', 'color')).toBe('rgb(0, 0, 255)')
  await expect.poll(() => css(page, '#live', 'padding-left')).toBe('10px')
  await expect.poll(() => css(page, '#live', 'background-color')).toBe('rgb(255, 200, 200)')
})

test('fill is unavailable when the parent has no set height', async ({ page }) => {
  await start(page)
  await page.locator('.hero h1').click({ force: true })
  await field(page, 'height-mode').locator('.select-btn').click()
  const fill = field(page, 'height-mode').locator('.choices [data-value="fill"]')
  await expect(fill).toHaveText('Fill, parent has no set height')
  await expect(fill).toBeDisabled()
  await page.keyboard.press('Escape')
  await field(page, 'width-mode').locator('.select-btn').click()
  await expect(field(page, 'width-mode').locator('.choices [data-value="fill"]')).toBeEnabled()
})

test('named colors are accepted and stored as hex', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await o(page, '.tab[data-category="Appearance"]').click()
  const hex = field(page, 'background-color').locator('input[aria-label$="hex"]')
  await hex.fill('red')
  await expect(field(page, 'background-color')).not.toHaveClass(/invalid/)
  await expect.poll(() => css(page, '.link-chip', 'background-color')).toBe('rgb(255, 0, 0)')
  await hex.fill('notacolor')
  await expect(field(page, 'background-color')).toHaveClass(/invalid/)
})

test('picking from a transparent color produces a visible one', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await o(page, '.tab[data-category="Appearance"]').click()
  await field(page, 'background-color').locator('input[aria-label$="hex"]').fill('transparent')
  await field(page, 'background-color').locator('.swatch').click()
  const sv = (await o(page, '[data-picker] .sv').boundingBox())!
  await page.mouse.click(sv.x + sv.width * 0.8, sv.y + sv.height * 0.2)
  await expect.poll(() => css(page, '.link-chip', 'background-color')).toMatch(/^rgb\(/)
})

test('Cmd+Z belongs to the page when Courier has nothing to undo', async ({ page }) => {
  await start(page)
  const handled = await page.evaluate(() => {
    const seen: boolean[] = []
    window.addEventListener('keydown', (e) => e.key.toLowerCase() === 'z' && seen.push(e.defaultPrevented))
    ;(window as unknown as { seen: boolean[] }).seen = seen
    return true
  })
  expect(handled).toBe(true)
  // Keys go to Courier while its own controls have focus; here the page has it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('ControlOrMeta+z')
  expect(await page.evaluate(() => (window as unknown as { seen: boolean[] }).seen)).toEqual([false])
  // With something to undo, Courier takes it.
  await chip(page, 'X').click({ force: true })
  await field(page, 'padding-inline').locator('input').fill('20')
  await page.locator('.hero h1').click({ force: true })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('12px')
})

test('blocked clipboard falls back to a copy panel and keeps the changes', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } })
    document.execCommand = () => false
  })
  await chip(page, 'X').click({ force: true })
  await field(page, 'padding-inline').locator('input').fill('16')
  await o(page, '[aria-label="Copy all saved changes"]').click()
  await expect(o(page, '[aria-label="Copy these changes"] textarea')).toHaveValue(/padding-inline: 12px → 16px/)
  await expect(o(page, '[data-saved]')).toHaveText('1')
})

test('odd typed values: calc, negative margin, unit case, junk', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  const margin = field(page, 'margin-inline').locator('input')
  await margin.fill('-4')
  await expect.poll(() => css(page, '.link-chip', 'margin-left')).toBe('-4px')
  const pad = field(page, 'padding-inline')
  await pad.locator('input').fill('-4')
  await expect(pad).toHaveClass(/invalid/)
  await pad.locator('input').fill('1.5REM')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('24px')
  await pad.locator('input').fill('calc(10px + 2px)')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('12px')
  await pad.locator('input').fill('twelve')
  await expect(pad).toHaveClass(/invalid/)
})

test('a whole session produces no page errors', async ({ page }) => {
  const errors = await start(page)
  for (const sel of ['.hero', '.hero h1', '.nav-links', '.logo', '.step-card', '.step-card p', '.feature', '.code', '.footer']) {
    // Close the panel first so it can't sit over the next target. (With
    // nothing selected, Escape would close Courier itself.)
    if (await o(page, '.panel').count()) await page.keyboard.press('Escape')
    await page.locator(sel).first().scrollIntoViewIfNeeded()
    // Centre, not a corner: rounded corners don't hit test as the element.
    await page.locator(sel).first().click({ force: true })
    for (const t of await o(page, '.tab').all()) await t.click()
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(o(page, '.toolbar')).not.toHaveClass(/open/)
  expect(errors).toEqual([])
})

test("other dev tools' overlays are ignored and keep working while inspecting", async ({ page }) => {
  await start(page)
  // A stand-in for Next's dev indicator: a custom element on <body> with a
  // shadow root and a fixed button, like nextjs-portal.
  await page.evaluate(() => {
    const host = document.createElement('dev-indicator-portal')
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<button id="tool" style="position:fixed;left:16px;bottom:16px;width:40px;height:40px">N</button>'
    root.getElementById('tool')!.addEventListener('click', () => ((window as unknown as { toolClicked: boolean }).toolClicked = true))
    document.body.append(host)
  })
  const tool = page.locator('dev-indicator-portal #tool')
  await tool.hover({ force: true })
  await expect(o(page, '[data-hl="hover"]')).toHaveCount(0)
  await tool.click({ force: true })
  expect(await page.evaluate(() => (window as unknown as { toolClicked?: boolean }).toolClicked)).toBe(true)
  await expect(o(page, '.panel')).toHaveCount(0)
  // Page elements are still picked as usual.
  await chip(page, 'X').click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('a.link-chip')
})

test('unchecking "all matching" keeps unsaved edits on the selected element only', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await o(page, '.check-row').click()
  await o(page, '.tab[data-category="Appearance"]').click()
  await field(page, 'border-radius').locator('input').fill('20')
  for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', i)).toBe('20px')

  await o(page, '.check-row').click()
  await expect(o(page, '[data-scope-all]')).not.toBeChecked()
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 0)).toBe('20px')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 1)).toBe('8px')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 2)).toBe('8px')
  await expect(field(page, 'border-radius').locator('input')).toHaveValue('20')

  // Checking again spreads it back to every match.
  await o(page, '.check-row').click()
  for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', i)).toBe('20px')

  // One undo step per toggle, and the checkbox follows it.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 1)).toBe('8px')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 0)).toBe('20px')
  await expect(o(page, '[data-scope-all]')).not.toBeChecked()
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(o(page, '[data-scope-all]')).toBeChecked()
  await page.keyboard.press('ControlOrMeta+z')

  const text = await exported(page)
  expect(text).toContain('## Scope: ONLY this element (a.link-chip, text "X")')
  expect(text).not.toContain('ALL 3 matching')
})

test('saved group edits stay when the checkbox is unchecked later', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await o(page, '.check-row').click()
  await o(page, '.tab[data-category="Appearance"]').click()
  await field(page, 'border-radius').locator('input').fill('20')
  await o(page, '.btn-primary').click()
  await chip(page, 'GitHub').click({ force: true })
  await o(page, '.check-row').click()
  await expect(o(page, '[data-scope-all]')).not.toBeChecked()
  for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', i)).toBe('20px')
})

test('Reset changes clears everything on the selected element, group edits included', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  const reset = o(page, '[data-reset-element]')
  await expect(reset).toBeDisabled()
  // A saved group edit and an unsaved single edit on X, plus an edit on LinkedIn.
  await o(page, '.check-row').click()
  await o(page, '.tab[data-category="Appearance"]').click()
  await field(page, 'border-radius').locator('input').fill('20')
  await o(page, '.btn-primary').click()
  await chip(page, 'X').click({ force: true })
  await o(page, '.check-row').click()
  await o(page, '.tab[data-category="Layout"]').click()
  await field(page, 'padding-inline').locator('input').fill('30')
  await chip(page, 'LinkedIn').click({ force: true })
  await o(page, '.tab[data-category="Appearance"]').click()
  await field(page, 'border-radius').locator('input').fill('2')

  await chip(page, 'X').click({ force: true })
  await expect(reset).toBeEnabled()
  await reset.click()
  for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', i)).toBe('8px')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('12px')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 3)).toBe('2px')
  await expect(reset).toBeDisabled()

  // One undo brings all of it back.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 1)).toBe('20px')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('30px')
})

test('resizing an svg without a viewBox adds one so the drawing scales, and says so', async ({ page }) => {
  await start(page)
  // Like the Simple Light feature icons: width and height, no viewBox.
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.className = 'vb-chip'
    a.href = '#'
    a.style.cssText = 'display:inline-flex;gap:8px;align-items:center;padding:6px'
    a.innerHTML = '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h16v16H0z" fill="blue"/></svg><span>Plain</span>'
    document.querySelector('.hero')!.append(a)
  })
  const drawn = () => page.locator('.vb-chip path').evaluate((p) => Math.round(p.getBoundingClientRect().width))
  expect(await drawn()).toBe(16)
  await page.locator('.vb-chip').click({ force: true })
  await o(page, '.tab[data-category="Icon"]').click()
  await expect(o(page, '[data-viewbox-note]')).toContainText('viewBox 0 0 16 16')
  await o(page, '[aria-label="Icon width"]').fill('2')
  await o(page, '[aria-label="Icon width"]').fill('28')
  await expect.poll(() => page.locator('.vb-chip svg').getAttribute('viewBox')).toBe('0 0 16 16')
  await expect.poll(drawn).toBe(28)
  // One undo step for the whole edit, viewBox included.
  await page.keyboard.press('ControlOrMeta+z')
  expect(await page.locator('.vb-chip svg').getAttribute('viewBox')).toBeNull()
  expect(await drawn()).toBe(16)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  const text = await exported(page)
  expect(text).toContain('width: 16px → 28px')
  expect(text).toContain('viewBox attribute: none → 0 0 16 16 (add it in the markup')
})

test("a button's gap edits the wrapper that lays out its label and arrow", async ({ page }) => {
  await start(page)
  // Like Simple Light's CTA: the button's only child is the label wrapper.
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.className = 'cta-btn'
    a.href = '#'
    a.style.cssText = 'display:inline-flex;padding:10px 16px;background:#2b6ef6;color:#fff;border-radius:8px'
    a.innerHTML = '<span class="label" style="display:inline-flex;align-items:center">Start Free Trial <span class="arrow-glyph" style="margin-left:4px">-&gt;</span></span>'
    document.querySelector('.hero')!.append(a)
  })
  // Distance from the label's start to the arrow (the button is centred, so it also shifts).
  const arrowX = () =>
    page.locator('.cta-btn .label').evaluate((l) => Math.round(l.querySelector('.arrow-glyph')!.getBoundingClientRect().left - l.getBoundingClientRect().left))
  // Measure after the page font has loaded, or the label reflows under us.
  await page.evaluate(() => document.fonts.ready)
  const before = await arrowX()
  await page.getByText('Start Free Trial').click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('a.cta-btn')
  const gap = o(page, '[data-row~="gap"] input').first()
  // "normal" on a flex box means 0, so it reads as 0.
  await expect(gap).toHaveValue('0')
  await gap.fill('12')
  await expect.poll(arrowX).toBe(before + 12)
  await expect.poll(() => css(page, '.cta-btn', 'column-gap')).toBe('normal')
  await expect.poll(() => css(page, '.cta-btn .label', 'column-gap')).toBe('12px')
  const text = await exported(page)
  expect(text).toContain('On the span.label that wraps the content inside this element (not on the element itself):')
  expect(text).toContain('    gap: 0px → 12px')
})

test('a container its children cover is reached with Select parent or Shift+Enter', async ({ page }) => {
  await start(page)
  await page.locator('.step-card').first().click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('article.step-card')
  await o(page, '[data-select-parent]').hover()
  await expect(o(page, '.tooltip')).toHaveText('Select parent div.steps, Shift Enter')
  await o(page, '[data-select-parent]').click()
  await expect(o(page, '.panel-title h2')).toHaveText('div.steps')
  await page.keyboard.press('Shift+Enter')
  await expect(o(page, '.panel-title h2')).toHaveText('section#how')
  // Not while typing in a field.
  await o(page, '.tab[data-category="Layout"]').click()
  await field(page, 'padding-inline').locator('input').click()
  await page.keyboard.press('Shift+Enter')
  await expect(o(page, '.panel-title h2')).toHaveText('section#how')
})

test('tooltips are never squeezed narrower than their text', async ({ page }) => {
  await start(page)
  await page.locator('.section h2').first().click({ force: true })
  await o(page, '.tab[data-category="Appearance"]').click()
  await o(page, '[data-add="Shape"]').click()
  await field(page, 'border-radius').locator('input').fill('8')
  await field(page, 'border-radius').locator('input').press('Enter')
  // Squeeze the space a tooltip would get if left where it would naturally render.
  await page.setViewportSize({ width: 900, height: 860 })
  for (const sel of ['[data-row~="border-radius"] .reset', '[data-select-parent]', '[aria-label="Copy all saved changes"]']) {
    await o(page, sel).hover()
    const tip = o(page, '.tooltip')
    await expect(tip).toBeVisible()
    const fits = await tip.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el.scrollWidth <= el.clientWidth + 1 && r.left >= 0 && r.right <= innerWidth
    })
    expect(fits).toBe(true)
  }
})

test('the collapsed pencil badge sits whole on the pill corner, not clipped', async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  await field(page, 'padding-inline').locator('input').fill('20')
  await o(page, '[data-courier-launcher]').click()
  const badge = o(page, '[data-launcher-badge]')
  await expect(badge).toHaveText('1')
  // Not inside the clipped pill.
  expect(await badge.evaluate((el) => !!el.closest('.toolbar'))).toBe(false)
  const b = (await badge.boundingBox())!
  const pill = (await o(page, '[data-courier-launcher]').boundingBox())!
  // On the top right corner of the visible circle.
  expect(b.x + b.width).toBeGreaterThan(pill.x + pill.width)
  expect(b.y).toBeLessThan(pill.y)
})

test('inspecting never puts the page into hover states, so matching and readings stay true', async ({ page }) => {
  await start(page)
  // Like a portfolio's contact buttons: a hover background.
  await page.addStyleTag({ content: '.link-chip:not(.is-featured):hover { background: rgb(255, 0, 0) !important }' })
  const github = chip(page, 'GitHub')
  await github.hover({ force: true })
  // The page never sees the pointer while inspecting.
  await expect.poll(() => css(page, '.link-chip', 'background-color', 1)).toBe('rgb(238, 238, 238)')
  await github.click({ force: true })
  // Readings are the normal look, so all three still match.
  await expect(o(page, '.check-row')).toContainText('Apply to all 3 matching elements')
  await o(page, '.tab[data-category="Appearance"]').click()
  await expect(field(page, 'background-color').locator('input[aria-label$="hex"]')).toHaveValue('#EEEEEE')
  // Closing Courier gives the page its pointer back.
  await o(page, '[data-courier-launcher]').click()
  await github.hover()
  await expect.poll(() => css(page, '.link-chip', 'background-color', 1)).toBe('rgb(255, 0, 0)')
})

test("dropdowns are Courier's own menu: check on the current value, keyboard works", async ({ page }) => {
  await start(page)
  await chip(page, 'X').click({ force: true })
  const display = field(page, 'display')
  const button = display.locator('.select-btn')
  await expect(display.locator('select')).toHaveCount(0)
  await button.click()
  const menu = display.locator('.choices')
  await expect(menu.locator('[aria-selected="true"] .choice-label')).toHaveText('Flex')
  // The check sits in its own column, in white, next to the current option.
  const check = menu.locator('[aria-selected="true"] .choice-check svg')
  const label = menu.locator('[aria-selected="true"] .choice-label')
  expect((await check.boundingBox())!.x).toBeLessThan((await label.boundingBox())!.x)
  expect(await check.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)')
  // Same font as the rest of the panel (Safari's native menus fell back to Times).
  const fonts = await page.locator('courier-overlay').evaluate((host) => {
    const root = host.shadowRoot!
    const item = root.querySelector('.choices .choice-label')!
    return [getComputedStyle(item).fontFamily, getComputedStyle(root.querySelector('.panel')!).fontFamily]
  })
  expect(fonts[0]).toBe(fonts[1])
  // Arrows move the highlight, Enter picks.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(button).toHaveAttribute('data-value', 'inline-flex')
  await expect.poll(() => css(page, '.link-chip', 'display')).toBe('flex')
  // Closed, arrows step through values directly; Escape closes an open menu.
  await page.keyboard.press('ArrowUp')
  await expect(button).toHaveAttribute('data-value', 'flex')
  await button.click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(o(page, '.panel')).toBeVisible()
})

test('a link whose row lives on an inner span: the note says so, Enter steps in, column works', async ({ page }) => {
  await start(page)
  // Like the portfolio's project rows: an absolute arrow plus one inner flex row.
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.className = 'project-row'
    a.href = '#'
    a.style.cssText = 'position:relative;display:flex;align-items:center;width:320px'
    a.innerHTML =
      '<svg style="position:absolute;left:0;top:0" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg>' +
      '<span class="project-line" style="display:flex"><span class="name">Erxes 3.0</span><span class="desc" style="margin-left:6px">Redesigning a platform</span></span>'
    document.querySelector('.hero')!.append(a)
  })
  await page.locator('.project-row .name').click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('a.project-row')
  await expect(o(page, '[data-row="flex-direction"] .pnote')).toContainText('One item inside, so direction changes nothing you can see')
  await expect(o(page, '[data-row="flex-direction"] .pnote')).toContainText('select the span.project-line')

  await page.keyboard.press('Enter')
  await expect(o(page, '.panel-title h2')).toHaveText('span.project-line')
  await expect(o(page, '[data-row="flex-direction"] .pnote')).toHaveCount(0)
  await field(page, 'flex-direction').locator('[data-value="column"]').click()
  // Name now sits above the description.
  const stacked = await page.locator('.project-row').evaluate((a) => {
    const n = a.querySelector('.name')!.getBoundingClientRect()
    const d = a.querySelector('.desc')!.getBoundingClientRect()
    return d.top >= n.bottom - 1
  })
  expect(stacked).toBe(true)

  // The header button does the same, and Shift+Enter goes back up.
  await page.keyboard.press('Shift+Enter')
  await expect(o(page, '.panel-title h2')).toHaveText('a.project-row')
  await o(page, '[data-select-child]').click()
  await expect(o(page, '.panel-title h2')).toHaveText('span.project-line')
})
