import { expect, test, type Page } from '@playwright/test'

/** Pick from one of Courier's dropdown menus (they're not native selects). */
async function choose(button: import('@playwright/test').Locator, value: string) {
  await button.click()
  await button.locator('xpath=..').locator(`.choices [data-value="${value}"]`).click()
}

// Playwright CSS locators pierce open shadow roots, so overlay parts are
// reachable as `courier-overlay .panel` etc.
const o = (page: Page, sel: string) => page.locator(`courier-overlay ${sel}`)
const chip = (page: Page, label: string) => page.locator('.link-chip', { hasText: new RegExp(`^${label}$`) })
const css = (page: Page, sel: string, prop: string, nth = 0) =>
  page.locator(sel).nth(nth).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
const field = (page: Page, property: string) => o(page, `[data-property="${property}"]`)
const tab = (page: Page, name: string) => o(page, `.tab[data-category="${name}"]`).click()

async function open(page: Page) {
  await page.goto('/')
  await o(page, '[data-courier-launcher]').click()
  await expect(o(page, '.toolbar')).toBeVisible()
}

async function select(page: Page, label: string) {
  await chip(page, label).click({ force: true })
  await expect(o(page, '.panel')).toBeVisible()
}

const saveBtn = (page: Page) => o(page, '.btn-primary')
const cancelBtn = (page: Page) => o(page, '[data-cancel]')
const copyBtn = (page: Page) => o(page, '[aria-label="Copy all saved changes"]')
const scopeAll = (page: Page) => o(page, '.check-row')
const tabs = (page: Page) => o(page, '.tab').evaluateAll((t) => t.map((x) => x.getAttribute('data-category')))

test('renders inside a shadow root and stays out of page styles', async ({ page }) => {
  await page.goto('/')
  expect(await page.locator('courier-overlay').evaluate((el) => !!el.shadowRoot)).toBe(true)
  const font = await o(page, '.root').evaluate((el) => getComputedStyle(el).fontFamily)
  expect(font).toContain('-apple-system')
})

test('hover highlights, click selects without navigating, tabs show one category at a time', async ({ page, context }) => {
  await open(page)
  await chip(page, 'GitHub').hover({ force: true })
  await expect(o(page, '[data-hl="hover"] .hl-label')).toContainText('a.link-chip')

  const popups: unknown[] = []
  context.on('page', (p) => popups.push(p))
  await chip(page, 'LinkedIn').locator('span').click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('a.link-chip.is-featured')
  expect(popups).toHaveLength(0)

  expect(await tabs(page)).toEqual(['Layout', 'Appearance', 'Text', 'Icon'])
  await expect(o(page, '[role="tabpanel"]')).toHaveAttribute('data-section', 'Layout')
  await tab(page, 'Text')
  await expect(o(page, '[role="tabpanel"]')).toHaveAttribute('data-section', 'Text')
  await expect(field(page, 'display')).toHaveCount(0)
  for (const p of ['color', 'font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing', 'text-transform']) {
    await expect(field(page, p)).toBeVisible()
  }

  // The open tab is kept when selecting something else that has it.
  await page.locator('.section h2').first().click({ force: true })
  await expect(o(page, '[role="tabpanel"]')).toHaveAttribute('data-section', 'Text')
})

test('a parent never edits its children: only its own text and direct icons', async ({ page }) => {
  await open(page)
  // The hero holds text and icons, but all of them belong to other elements.
  await page.locator('.hero').click({ position: { x: 10, y: 10 }, force: true })
  // Appearance is always offered so a fill or border can be added; Text and Icon stay off.
  expect(await tabs(page)).toEqual(['Layout', 'Appearance'])
  // The nav links are links of their own, so their container has no Text.
  await page.locator('.nav-links').click({ position: { x: 100, y: 2 }, force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('div.nav-links')
  expect(await tabs(page)).not.toContain('Text')
  // A chip owns its label span and its direct icon.
  await select(page, 'X')
  expect(await tabs(page)).toEqual(expect.arrayContaining(['Text', 'Icon']))
})

test('layout shows only controls that apply and edits live', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await expect(field(page, 'display').locator('.select-btn')).toHaveAttribute('data-value', 'flex')
  await expect(field(page, 'flex-direction').locator('[data-value="row"]')).toHaveClass(/on/)
  await expect(field(page, 'align-items').locator('[data-value="center"]')).toHaveClass(/on/)
  await expect(o(page, '[data-row~="gap"]')).toContainText('Between is set on the parent, affects all 4')

  const icon = field(page, 'align-items').locator('.seg-icon').first()
  await expect(icon).not.toHaveAttribute('style', /rotate/)
  await field(page, 'flex-direction').locator('[data-value="column"]').click()
  await expect.poll(() => css(page, '.link-chip', 'flex-direction')).toBe('column')
  await expect(icon).toHaveAttribute('style', /rotate\(-90deg\)/)

  await choose(field(page, 'display').locator('.select-btn'), 'block')
  await expect(field(page, 'flex-direction')).toHaveCount(0)
})

test('width and height have Fixed, Hug and Fill', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Layout')
  const mode = field(page, 'width-mode').locator('.select-btn')
  await expect(mode).toHaveAttribute('data-value', 'hug')
  await choose(mode, 'fill')
  await expect.poll(() => css(page, '.link-chip', 'flex-grow')).toBe('1')

  await field(page, 'width').locator('input').fill('90')
  await expect(mode).toHaveAttribute('data-value', 'fixed')
  await expect.poll(() => css(page, '.link-chip', 'width')).toBe('90px')
  await expect.poll(() => css(page, '.link-chip', 'flex-grow')).toBe('0')

  await page.locator('.section h2').first().click({ force: true })
  const h2mode = field(page, 'width-mode').locator('.select-btn')
  await expect(h2mode).toHaveAttribute('data-value', 'fill')
  const width = () => page.locator('.section h2').first().evaluate((el) => el.getBoundingClientRect().width)
  const before = await width()
  await choose(h2mode, 'hug')
  expect(await width()).toBeLessThan(before)
})

test('typing fast into a field keeps what was typed', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Icon')
  const input = o(page, '[aria-label="Icon width"]')
  for (const v of ['10', '8', '1', '13', '20', '30', '6']) {
    await input.fill(v)
    await expect(input).toHaveValue(v)
    await expect.poll(() => css(page, '.link-chip .arrow', 'width')).toBe(`${v}px`)
  }
  await input.press('ArrowDown')
  await input.press('ArrowDown')
  await expect(input).toHaveValue('4')
  await expect.poll(() => css(page, '.link-chip .arrow', 'width')).toBe('4px')
})

test('save keeps changes, cancel only drops unsaved edits', async ({ page }) => {
  await open(page)
  await select(page, 'Mail')
  await expect(saveBtn(page)).toBeDisabled()
  await o(page, '[data-sibling-gap="parent"] input').fill('16')
  await expect.poll(() => css(page, '.links', 'column-gap')).toBe('16px')
  await expect(o(page, '.tab[data-category="Layout"] .tab-count')).toHaveText('1')

  await saveBtn(page).click()
  await expect(o(page, '.panel')).toHaveCount(0)
  await expect(o(page, '[data-saved]')).toHaveText('1')

  await select(page, 'X')
  await expect(o(page, '.tab[data-category="Layout"] .tab-count')).toHaveText('1')
  await tab(page, 'Appearance')
  await field(page, 'border-radius').locator('input').fill('12')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('12px')

  await cancelBtn(page).click()
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('8px')
  await expect.poll(() => css(page, '.links', 'column-gap')).toBe('16px')
  await expect(o(page, '[data-saved]')).toHaveText('1')
})

test('validation, unit choices, scrubbing, undo, redo and per field reset', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Layout')
  const horizontal = field(page, 'padding-inline')
  const input = horizontal.locator('input')
  await expect(o(page, '.stepper')).toHaveCount(0)

  await input.fill('abc')
  await expect(horizontal).toHaveClass(/invalid/)
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('12px')

  await input.fill('20')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('20px')

  // Empty field: choices open. Typing closes them.
  await input.fill('')
  await expect(horizontal.locator('.choices')).toBeVisible()
  await input.pressSequentially('2')
  await expect(horizontal.locator('.choices')).toHaveCount(0)
  await input.fill('20')
  await input.fill('')
  await horizontal.locator('.choices button', { hasText: 'rem' }).click()
  await expect(input).toHaveValue('1.25')
  await expect(horizontal.locator('.suffix')).toHaveText('rem')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('20px')

  await input.press('ArrowUp')
  await expect(input).toHaveValue('2.25')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(input).toHaveValue('1.25')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(input).toHaveValue('2.25')

  const prefix = field(page, 'padding-block').locator('.prefix')
  const box = (await prefix.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(parseFloat(await css(page, '.link-chip', 'padding-top'))).toBeGreaterThan(8)

  // Individual sides: two rows of fields, label stays level with the first.
  await o(page, '[data-row~="padding"] [aria-label="Individual sides"]').click()
  await expect(field(page, 'padding-top')).toBeVisible()
  const label = (await o(page, '[data-row~="padding"] .plabel').boundingBox())!
  const first = (await field(page, 'padding-top').boundingBox())!
  expect(Math.abs(label.y + label.height / 2 - (first.y + first.height / 2))).toBeLessThan(2)

  await o(page, '[data-row~="padding"] .reset').click()
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('12px')
  await expect.poll(() => css(page, '.link-chip', 'padding-top')).toBe('8px')
})

test('keyword fields open their choices on focus', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Text')
  const lh = field(page, 'line-height')
  await lh.locator('input').click()
  await expect(lh.locator('.choices')).toBeVisible()
  await lh.locator('.choices button', { hasText: 'Convert to px' }).click()
  await expect.poll(() => css(page, '.link-chip', 'line-height')).toMatch(/px$/)
  await expect(lh.locator('.suffix')).toHaveText('px')
})

test('hex color picker replaces the system dialog', async ({ page }) => {
  await open(page)
  await select(page, 'LinkedIn')
  await tab(page, 'Appearance')
  const bg = field(page, 'background-color')
  await expect(bg.locator('input[type="color"]')).toHaveCount(0)
  await bg.locator('.swatch').click()
  const picker = o(page, '[data-picker]')
  await expect(picker).toBeVisible()
  await picker.locator('.palette button', { hasText: '' }).first().click()
  const sv = (await picker.locator('.sv').boundingBox())!
  await page.mouse.click(sv.x + sv.width - 2, sv.y + 2)
  // Top right of the square is the pure hue.
  await expect(bg.locator('input[aria-label$="hex"]')).toHaveValue(/^#[0-9A-F]{6}$/)
  await expect.poll(() => css(page, '.link-chip', 'background-color', 3)).not.toBe('rgb(238, 244, 255)')
})

test('controls are 28px tall with 6px corners and 14px text', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  const sizes = await o(page, '.panel').evaluate((panel) =>
    // Underline tabs are 28px but square by design.
    [...panel.querySelectorAll('.field, .btn, .seg button, .icon-btn')].map((el) => {
      const cs = getComputedStyle(el)
      return `${el.getBoundingClientRect().height}|${cs.borderTopLeftRadius}`
    }),
  )
  expect(new Set(sizes)).toEqual(new Set(['28|6px']))
  const fonts = await o(page, '.panel').evaluate((panel) =>
    [...new Set([...panel.querySelectorAll('*')].filter((el) => !el.closest('.badge, .tab-count') && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())).map((el) => getComputedStyle(el).fontSize))],
  )
  expect(fonts).toEqual(['14px'])
})

test('scope checkbox applies to all matching siblings and their icons', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await expect(scopeAll(page)).toContainText('Apply to all 3 matching elements')
  await scopeAll(page).click()
  await expect(o(page, '[data-hl="match"]')).toHaveCount(2)

  await tab(page, 'Icon')
  await o(page, '[aria-label="Icon width"]').fill('16')
  for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.link-chip .arrow', 'width', i)).toBe('16px')
  await expect.poll(() => css(page, '.link-chip .arrow', 'width', 3)).toBe('10px')

  await chip(page, 'LinkedIn').click({ force: true })
  await expect(scopeAll(page)).toHaveCount(0)
})

test('copy exports everything saved, grouped by scope, then clears', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await scopeAll(page).click()
  await tab(page, 'Layout')
  await field(page, 'padding-inline').locator('input').fill('16')
  await saveBtn(page).click()

  await select(page, 'LinkedIn')
  await tab(page, 'Appearance')
  await field(page, 'background-color').locator('input[aria-label$="hex"]').fill('#E2E8F0')
  await tab(page, 'Icon')
  await o(page, '[aria-label="Icon width"]').fill('16')
  await tab(page, 'Layout')
  await o(page, '[data-sibling-gap="parent"] input').fill('12')
  await saveBtn(page).click()
  // Width and height move together on icons.
  await expect(o(page, '[data-saved]')).toHaveText('5')

  await copyBtn(page).click()
  await expect(o(page, '.toast')).toHaveText('Copied 5 changes')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('Changes: 5 (Layout 1, Spacing 1, Fill 1, Icon 2)')
  expect(text).toContain('## Scope: ALL 3 matching elements (a.link-chip)')
  expect(text).toContain('Component: LinkChip')
  expect(text).toContain('  padding-inline: 12px → 16px')
  expect(text).toContain('## Scope: ONLY this element (a.link-chip.is-featured, text "LinkedIn")')
  expect(text).toContain('  background-color: #EEF4FF → #E2E8F0')
  expect(text).toContain('  Icon: svg.arrow inside this element:\n    width: 10px → 16px\n    height: 10px → 16px')
  expect(text).toContain('## Spacing owner: parent div.links')
  expect(text).toContain('  gap: 8px → 12px')

  await expect(o(page, '[data-saved]')).toHaveCount(0)
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('12px')
})

test('sibling gap identifies margins and space distribution', async ({ page }) => {
  await open(page)
  await page.locator('.feature').nth(1).click({ force: true })
  await tab(page, 'Layout')
  await expect(o(page, '[data-sibling-gap="margin"]')).toBeVisible()
  await expect(o(page, '.pnote')).toContainText('Between is set as margin bottom on this element')
  await page.locator('.logo').click({ force: true })
  await expect(o(page, '.pnote')).toContainText('justify content space between')
})

test('escape deselects, close keeps pending changes', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Appearance')
  await field(page, 'border-radius').locator('input').fill('12')
  await page.keyboard.press('Escape')
  await expect(o(page, '.panel')).toHaveCount(0)
  await o(page, '[aria-label="Close"]').click()
  await expect(o(page, '[data-launcher-badge]')).toHaveText('1')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('12px')
})

test('tabs scroll sideways with faded edges, header shows no text preview', async ({ page }) => {
  await page.setViewportSize({ width: 250, height: 800 })
  await open(page)
  await select(page, 'LinkedIn')
  await expect(o(page, '.panel-title p')).toHaveCount(0)
  const bar = o(page, '.tabs')
  await expect(bar).toHaveClass(/fade-right/)
  await expect(bar).not.toHaveClass(/fade-left/)
  await bar.evaluate((el) => (el.scrollLeft = 60))
  await expect(bar).toHaveClass(/fade-left/)
  // First tab text lines up with the panel's 16px side padding.
  await bar.evaluate((el) => (el.scrollLeft = 0))
  const panel = (await o(page, '.panel').boundingBox())!
  const first = (await o(page, '.tab').first().boundingBox())!
  expect(Math.round(first.x - panel.x)).toBe(16)
  // Active tab: white text, white underline, no fill.
  const style = await o(page, '.tab.on').evaluate((el) => {
    const cs = getComputedStyle(el)
    return [cs.color, cs.borderBottomColor, cs.backgroundColor].join('|')
  })
  expect(style).toBe('rgb(255, 255, 255)|rgb(255, 255, 255)|rgba(0, 0, 0, 0)')
})

test('tooltips render above everything, even at the panel edge', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await o(page, '[aria-label="Undo"]').hover()
  const tip = o(page, '.tooltip')
  await expect(tip).toHaveText('Undo')
  const t = (await tip.boundingBox())!
  const panel = (await o(page, '.panel').boundingBox())!
  // Drawn outside the panel's clipping: it pokes out above the top edge.
  expect(t.y).toBeLessThan(panel.y - 10)
})

test('numeric fields select all on focus; choices are capitalized', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Layout')
  const input = field(page, 'padding-inline').locator('input')
  await input.click()
  expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length])).toEqual([0, 2, 2])
  await page.keyboard.type('30')
  await expect.poll(() => css(page, '.link-chip', 'padding-left')).toBe('30px')
  await input.fill('')
  const labels = await field(page, 'padding-inline').locator('.choices button').allTextContents()
  expect(labels).toEqual(['Convert to rem', 'Convert to em', 'Convert to %'])
  await tab(page, 'Text')
  await field(page, 'line-height').locator('input').click()
  expect(await field(page, 'line-height').locator('.choices button').first().textContent()).toBe('Normal')
})

test('color picker opens as an overlay and closes on outside click or Escape', async ({ page }) => {
  await open(page)
  await select(page, 'LinkedIn')
  await tab(page, 'Appearance')
  await field(page, 'background-color').locator('.swatch').click()
  const pop = o(page, '[data-popover]')
  await expect(pop).toBeVisible()
  expect(await pop.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  // Hugging the field: right under it, or right above when there's no room below.
  const f = (await field(page, 'background-color').boundingBox())!
  const b = (await pop.boundingBox())!
  expect(Math.round(b.x)).toBe(Math.round(f.x))
  const gapBelow = b.y - (f.y + f.height)
  const gapAbove = f.y - (b.y + b.height)
  expect([gapBelow, gapAbove].some((g) => g >= 0 && g < 10)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
  await expect(o(page, '.panel')).toBeVisible()
  await field(page, 'background-color').locator('.swatch').click()
  await expect(pop).toBeVisible()
  await page.mouse.click(20, 300)
  await expect(pop).toHaveCount(0)
})

test('the panel drags, but keeps at least 20% on screen', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  const head = o(page, '.panel-title')
  const start = (await head.boundingBox())!
  await page.mouse.move(start.x + 20, start.y + 8)
  await page.mouse.down()
  await page.mouse.move(start.x - 300, start.y + 8, { steps: 5 })
  await page.mouse.up()
  const moved = (await o(page, '.panel').boundingBox())!
  expect(start.x - 16 - moved.x).toBeGreaterThan(250)
  // Fling it far off the right edge.
  const head2 = (await head.boundingBox())!
  await page.mouse.move(head2.x + 20, head2.y + 8)
  await page.mouse.down()
  await page.mouse.move(head2.x + 3000, head2.y + 8, { steps: 5 })
  await page.mouse.up()
  const box = (await o(page, '.panel').boundingBox())!
  const viewport = page.viewportSize()!
  expect(viewport.width - box.x).toBeGreaterThanOrEqual(box.width * 0.2 - 1)
  // Bring it back; fields still work after dragging.
  const head3 = (await head.boundingBox())!
  await page.mouse.move(head3.x + 10, head3.y + 8)
  await page.mouse.down()
  await page.mouse.move(head3.x - 600, head3.y + 8, { steps: 5 })
  await page.mouse.up()
  await tab(page, 'Appearance')
  await field(page, 'border-radius').locator('input').fill('14')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('14px')
})

test('switching from Hug or Fill to Fixed sticks, and the export says what it was', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Layout')
  const mode = field(page, 'width-mode').locator('.select-btn')
  await expect(mode).toHaveAttribute('data-value', 'hug')
  await choose(mode, 'fixed')
  await expect(mode).toHaveAttribute('data-value', 'fixed')
  await choose(mode, 'fill')
  await expect(mode).toHaveAttribute('data-value', 'fill')
  await choose(mode, 'fixed')
  await expect(mode).toHaveAttribute('data-value', 'fixed')
  // Back to Hug removes the change entirely.
  await choose(mode, 'hug')
  await expect(mode).toHaveAttribute('data-value', 'hug')
  await expect(o(page, '.tab[data-category="Layout"] .tab-count')).toHaveCount(0)
  await choose(mode, 'fixed')
  await copyBtn(page).click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toMatch(/width: auto \(hugs content, [\d.]+px\) → \d+px/)
})

test('layout, size and spacing share a tab; gap is one row', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Layout')
  await expect(field(page, 'display')).toBeVisible()
  const gapRow = o(page, '[data-row~="gap"]')
  await expect(gapRow.locator('.field')).toHaveCount(2)
  await expect(gapRow.locator('.plabel')).toHaveText('Gap')
  await expect(field(page, 'width-mode')).toBeVisible()
  await expect(field(page, 'padding-inline')).toBeVisible()
  await field(page, 'padding-inline').locator('input').fill('14')
  await tab(page, 'Layout')
  await field(page, 'width').locator('input').fill('80')
  await expect(o(page, '.tab[data-category="Layout"] .tab-count')).toHaveText('2')
})

test('mouse users scroll the tabs with the wheel or by dragging', async ({ page }) => {
  await page.setViewportSize({ width: 250, height: 800 })
  await open(page)
  await select(page, 'LinkedIn')
  const bar = o(page, '.tabs')
  await bar.hover()
  await page.mouse.wheel(0, 120)
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  await bar.evaluate((el) => (el.scrollLeft = 0))
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  // The drag didn't switch tabs.
  await expect(o(page, '[role="tabpanel"]')).toHaveAttribute('data-section', 'Layout')
})

test('the panel keeps one height across tabs and its body scrolls', async ({ page }) => {
  await open(page)
  await select(page, 'LinkedIn')
  const height = () => o(page, '.panel').evaluate((el) => Math.round(el.getBoundingClientRect().height))
  const h = await height()
  expect(h).toBe(540)
  for (const t of ['Appearance', 'Text', 'Icon', 'Layout']) {
    await tab(page, t)
    expect(await height()).toBe(h)
  }
  // Layout is the longest tab: it scrolls inside the panel, never resizing it.
  const body = o(page, '.panel-body')
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await body.evaluate((el) => (el.scrollTop = 200))
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  // A new tab starts at the top.
  await tab(page, 'Text')
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0)
  expect(await body.evaluate((el) => el.getAnimations().length)).toBe(0)
})

test('labels, tabs and buttons are not selectable; inputs are', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  // Safari applies the prefixed property and reports the standard one as auto.
  const sel = (s: string) =>
    o(page, s).first().evaluate((el) => {
      const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string }
      return cs.webkitUserSelect || cs.userSelect
    })
  expect(await sel('.tab')).toBe('none')
  expect(await sel('.plabel')).toBe('none')
  expect(await sel('.btn')).toBe('none')
  expect(await sel('.field input')).toBe('text')
})

test('appearance holds fill, then shape, then border; badges are not clipped', async ({ page }) => {
  await open(page)
  await select(page, 'LinkedIn')
  await tab(page, 'Appearance')
  const order = await o(page, '[role="tabpanel"]').evaluate((el) =>
    [...el.querySelectorAll('[data-property]')].map((f) => f.getAttribute('data-property')),
  )
  expect(order.indexOf('background-color')).toBeLessThan(order.indexOf('border-radius'))
  expect(order.indexOf('border-radius')).toBeLessThan(order.indexOf('border-color'))
  await field(page, 'border-radius').locator('input').fill('12')
  await expect(o(page, '.tab[data-category="Appearance"] .tab-count')).toBeVisible()
  await page.waitForTimeout(250)
  // Both rects in one go, so a resizing panel can't skew the comparison.
  const [badgeTop, barTop] = await o(page, '.tabs').evaluate((bar) => [
    bar.querySelector('.tab-count')!.getBoundingClientRect().top,
    bar.getBoundingClientRect().top,
  ])
  expect(badgeTop).toBeGreaterThanOrEqual(barTop)
})

test('layout flows: size under direction, spacing under gap, no dividers', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  const order = await o(page, '[role="tabpanel"]').evaluate((el) =>
    [...el.querySelectorAll('[data-row]')].map((r) => r.getAttribute('data-row')!.split(' ')[0]),
  )
  const at = (p: string) => order.findIndex((r) => r === p)
  expect(at('flex-direction')).toBeLessThan(at('width'))
  expect(at('width')).toBeLessThan(at('align-items'))
  expect(at('gap')).toBeLessThan(at('padding'))
  expect(await o(page, '[role="tabpanel"] .pgroup').count()).toBe(0)
})

test('font shows as text and becomes a field on click', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Text')
  const font = field(page, 'font-family')
  expect(await font.evaluate((el) => el.tagName)).toBe('BUTTON')
  await font.click()
  await expect(field(page, 'font-family').locator('input')).toBeFocused()
  await field(page, 'font-family').locator('input').fill('Georgia, serif')
  await expect.poll(() => css(page, '.link-chip', 'font-family')).toContain('Georgia')
  await page.keyboard.press('Tab')
  expect(await field(page, 'font-family').evaluate((el) => el.tagName)).toBe('BUTTON')
})

test('icon width and height stay in proportion until unlocked', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Icon')
  const lock = o(page, '[aria-label="Keep proportions"]')
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await o(page, '[aria-label="Icon width"]').fill('20')
  await expect.poll(() => css(page, '.link-chip .arrow', 'height')).toBe('20px')
  // One undo step for both.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => css(page, '.link-chip .arrow', 'width')).toBe('10px')
  await expect.poll(() => css(page, '.link-chip .arrow', 'height')).toBe('10px')
  await lock.click()
  await o(page, '[aria-label="Icon width"]').fill('24')
  await expect.poll(() => css(page, '.link-chip .arrow', 'height')).toBe('10px')
})

test('escape closes an overlay first, then the panel; dead space closes choices', async ({ page }) => {
  await open(page)
  await select(page, 'LinkedIn')
  await tab(page, 'Appearance')
  const hex = field(page, 'background-color').locator('input[aria-label$="hex"]')
  await hex.fill('')
  const choices = field(page, 'background-color').locator('.choices')
  await expect(choices).toBeVisible()
  // Color choices lead with a swatch.
  await expect(choices.locator('.choice-swatch').first()).toBeVisible()
  expect(await choices.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px')
  await page.keyboard.press('Escape')
  await expect(choices).toHaveCount(0)
  await expect(o(page, '.panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(o(page, '.panel')).toHaveCount(0)

  await select(page, 'LinkedIn')
  await tab(page, 'Appearance')
  await hex.fill('')
  await expect(choices).toBeVisible()
  await o(page, '[data-row="opacity"] .plabel').click()
  await expect(choices).toHaveCount(0)
})

test('toolbar: the pencil opens Courier and turns into the close button in place', async ({ page }) => {
  await page.goto('/')
  const bar = o(page, '.toolbar')
  const launcher = o(page, '[data-courier-launcher]')
  const before = (await launcher.boundingBox())!
  expect([before.width, before.height]).toEqual([40, 40])
  expect((await bar.boundingBox())!.height).toBe(48)
  await expect(launcher).toHaveAttribute('aria-label', 'Open Courier')
  // Collapsed: eye and copy are clipped away and out of the tab order.
  await expect(o(page, '[aria-label="Copy all saved changes"]')).toHaveAttribute('tabindex', '-1')

  await launcher.click()
  const anims = await bar.evaluate((el) => el.getAnimations().map((a) => (a as CSSTransition).transitionProperty))
  expect(anims).toContain('clip-path')
  await page.waitForTimeout(300)
  // Same spot, now the close button; no separate inspect toggle.
  const after = (await launcher.boundingBox())!
  expect(Math.round(after.x)).toBe(Math.round(before.x))
  await expect(launcher).toHaveAttribute('aria-label', 'Close')
  expect(await o(page, '.launcher .x').evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  await expect(o(page, '[aria-label="Stop inspecting"], [aria-label="Inspect"]')).toHaveCount(0)
  await expect(o(page, '[aria-label="Copy all saved changes"]')).toHaveAttribute('tabindex', '0')
  // Inspecting is on as soon as it opens.
  await page.locator('.link-chip').first().hover({ force: true })
  await expect(o(page, '[data-hl="hover"]')).toBeVisible()

  await launcher.click()
  await expect(launcher).toHaveAttribute('aria-label', 'Open Courier')
  await page.locator('.link-chip').first().hover({ force: true })
  await expect(o(page, '[data-hl="hover"]')).toHaveCount(0)
})

test('copy with nothing saved: tooltip explains, click shakes', async ({ page }) => {
  await open(page)
  const copy = copyBtn(page)
  await copy.hover()
  await expect(o(page, '.tooltip')).toHaveText('Nothing saved yet')
  await copy.click()
  expect(await o(page, '.tool-icon').evaluate((el) => el.getAnimations().length)).toBe(1)
  await expect(o(page, '.toast')).toHaveCount(0)
})

test('collapsed pencil sits 48px from the right and bottom', async ({ page }) => {
  await page.goto('/')
  const vp = page.viewportSize()!
  const pill = (await o(page, '.toolbar').boundingBox())!
  expect(Math.round(vp.width - (pill.x + pill.width))).toBe(48)
  expect(Math.round(vp.height - (pill.y + pill.height))).toBe(48)
})

test('select options are capitalized; stroke nudges by 0.1', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await field(page, 'display').locator('.select-btn').click()
  const labels = await field(page, 'display').locator('.choices .choice-label').allTextContents()
  await page.keyboard.press('Escape')
  expect(labels).toContain('Inline block')
  expect(labels).toContain('Flex')
  await tab(page, 'Icon')
  const stroke = o(page, '[aria-label="Stroke width"]')
  const before = Number(await stroke.inputValue())
  await stroke.press('ArrowUp')
  await expect(stroke).toHaveValue(String(Math.round((before + 0.1) * 100) / 100))
})

test('any font weight can be typed; a note says when the font snaps it', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await tab(page, 'Text')
  const weight = field(page, 'font-weight').locator('input')
  await weight.fill('450')
  await expect.poll(() => css(page, '.link-chip', 'font-weight')).toBe('450')
  await expect(o(page, '[data-row="font-weight"] .pnote')).toHaveText('Inter loads 400, 500 and 600, so 450 shows as 500')
  await weight.fill('600')
  await expect(o(page, '[data-row="font-weight"] .pnote')).toHaveCount(0)
  await weight.fill('')
  await expect(field(page, 'font-weight').locator('.choices button').first()).toContainText('Thin')
})

test('repeated cards: the same element in every card matches', async ({ page }) => {
  await open(page)
  await page.locator('.step-card p').nth(1).click({ force: true })
  await expect(scopeAll(page)).toContainText('Apply to all 3 matching elements')
  await scopeAll(page).click()
  await tab(page, 'Text')
  await field(page, 'color').locator('input[aria-label$="hex"]').fill('#FF0000')
  for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.step-card p', 'color', i)).toBe('rgb(255, 0, 0)')
  await expect.poll(() => css(page, '.step-card h3', 'color')).not.toBe('rgb(255, 0, 0)')
  await copyBtn(page).click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('## Scope: ALL 3 matching elements (p)')
  expect(text).toContain('Selector: article.step-card > p\n')
})

test('saved changes show markers on the page; the eye hides and shows only the markers', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await scopeAll(page).click()
  await tab(page, 'Appearance')
  await field(page, 'border-radius').locator('input').fill('16')
  await saveBtn(page).click()
  await expect(o(page, '[data-marker]')).toHaveCount(3)
  await expect(o(page, '[data-marker]').first()).toHaveText('1')

  // The eye hides the badges only. The change itself stays on the page.
  const eye = o(page, '[data-eye]')
  await eye.click()
  await expect(o(page, '[data-marker]')).toHaveCount(0)
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('16px')
  await eye.click()
  await expect(o(page, '[data-marker]')).toHaveCount(3)
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('16px')

  // Markers stay when Courier is collapsed, and open the element on click.
  await o(page, '[aria-label="Close"]').click()
  await expect(o(page, '[data-marker]')).toHaveCount(3)
  await o(page, '[data-marker]').nth(1).click()
  await expect(o(page, '.panel-title h2')).toHaveText('a.link-chip')
})

test('the trash button deletes every change, and undo brings them back', async ({ page }) => {
  await open(page)
  await select(page, 'X')
  await scopeAll(page).click()
  await tab(page, 'Appearance')
  await field(page, 'border-radius').locator('input').fill('16')
  await saveBtn(page).click()
  await expect(o(page, '[data-marker]')).toHaveCount(3)

  await o(page, '[data-trash]').click()
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('8px')
  await expect(o(page, '[data-marker]')).toHaveCount(0)
  await expect(o(page, '[data-saved]')).toHaveCount(0)
  await expect(o(page, '.toast')).toHaveText('Deleted 1 change')

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('16px')
  await expect(o(page, '[data-marker]')).toHaveCount(3)
})

test('tooltips go away when the pointer leaves', async ({ page }) => {
  await open(page)
  await page.waitForTimeout(300)
  await copyBtn(page).hover()
  await expect(o(page, '.tooltip')).toBeVisible()
  await page.mouse.move(600, 300, { steps: 8 })
  await expect(o(page, '.tooltip')).toHaveCount(0)
  // Moving between buttons swaps the tip instead of leaving a stale one.
  await o(page, '[aria-label="Close"]').hover()
  await expect(o(page, '.tooltip')).toHaveText('Close')
  await page.mouse.move(1279, 859, { steps: 4 })
  await expect(o(page, '.tooltip')).toHaveCount(0)
})

test('a down arrow shows while there is more below, and goes once scrolled to the bottom', async ({ page }) => {
  await open(page)
  await select(page, 'LinkedIn')
  const more = o(page, '[data-scroll-more]')
  const body = o(page, '.panel-body')
  // Layout is longer than the panel.
  await expect(more).toHaveClass(/show/)
  const shadow = await more.evaluate((el) => getComputedStyle(el).boxShadow)
  expect(shadow).toContain('rgba(0, 0, 0, 0.65)')
  const box = (await more.boundingBox())!
  expect([box.width, box.height]).toEqual([28, 28])
  expect(await more.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%')
  // The content fades out under it.
  await expect(page.locator('courier-overlay .body-wrap')).toHaveClass(/fade-bottom/)
  // Each click moves down; at the bottom it disappears.
  const atBottom = () => body.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2)
  for (let i = 0; i < 6 && !(await atBottom()); i++) {
    const before = await body.evaluate((el) => el.scrollTop)
    await more.click()
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(before)
    // Let the smooth scroll settle before deciding whether to click again.
    await page.waitForTimeout(400)
  }
  await expect(more).not.toHaveClass(/show/)
  await expect(page.locator('courier-overlay .body-wrap')).not.toHaveClass(/fade-bottom/)
  expect(await body.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2)).toBe(true)
  // Scrolling back up brings it back; a tab that fits shows none.
  await body.evaluate((el) => (el.scrollTop = 0))
  await expect(more).toHaveClass(/show/)
  await tab(page, 'Text')
  await page.locator('.section h2').first().click({ force: true })
  await tab(page, 'Appearance')
  await expect(more).not.toHaveClass(/show/)
})
