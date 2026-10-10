import { expect, test, type Page } from '@playwright/test'

const o = (page: Page, s: string) => page.locator(`courier-overlay ${s}`)
const css = (page: Page, sel: string, prop: string, nth = 0) =>
  page.locator(sel).nth(nth).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)
const field = (page: Page, p: string) => o(page, `[data-property="${p}"]`)
const chip = (page: Page, label: string) => page.locator('.link-chip', { hasText: new RegExp(`^${label}$`) })

async function open(page: Page) {
  await page.goto('/')
  await o(page, '[data-courier-launcher]').click()
}

test.describe('adding what an element does not use yet', () => {
  test('a plain heading can get a fill, radius and border', async ({ page }) => {
    await open(page)
    await page.locator('.section h2').first().click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    const add = (c: string) => o(page, `[data-add="${c}"]`)
    await expect(add('Fill')).toBeVisible()
    await expect(add('Shape')).toHaveText('Radius')
    await expect(add('Border')).toBeVisible()

    // + Fill reveals the fill and opens the picker, ready for one click.
    await add('Fill').click()
    await expect(o(page, '[data-picker]')).toBeVisible()
    await o(page, '[data-picker] .palette button').first().click()
    await expect.poll(() => css(page, '.section h2', 'background-color')).not.toBe('rgba(0, 0, 0, 0)')
    await expect(add('Fill')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // + Border is visible immediately.
    await add('Border').click()
    await expect.poll(() => css(page, '.section h2', 'border-top-style')).toBe('solid')
    await expect.poll(() => css(page, '.section h2', 'border-top-width')).toBe('1px')
    await expect(field(page, 'border-width')).toBeVisible()

    // + Radius reveals the field.
    await add('Shape').click()
    await field(page, 'border-radius').locator('input').fill('8')
    await expect.poll(() => css(page, '.section h2', 'border-top-left-radius')).toBe('8px')
    await expect(o(page, '[data-add-row]')).toHaveCount(0)

    await o(page, '[aria-label="Copy all saved changes"]').click()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain('border-style: none → solid')
    expect(text).toContain('border-width: 0px → 1px')
    expect(text).toContain('border-radius: 0px → 8px')
  })

  test('spacing can be added to an element with none', async ({ page }) => {
    await open(page)
    await page.locator('.step-card p').first().click({ force: true })
    await expect(field(page, 'padding-inline')).toHaveCount(0)
    await o(page, '[data-add="Spacing"]').click()
    await field(page, 'padding-inline').locator('input').fill('6')
    await expect.poll(() => css(page, '.step-card p', 'padding-left')).toBe('6px')
  })

  test('added sections belong to one selection', async ({ page }) => {
    await open(page)
    await page.locator('.section h2').first().click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await o(page, '[data-add="Shape"]').click()
    await page.locator('.section h2').nth(1).click({ force: true })
    await expect(o(page, '[data-add="Shape"]')).toBeVisible()
  })
})

test.describe('surviving reloads', () => {
  test('pending and saved changes come back after a reload', async ({ page }) => {
    await open(page)
    await chip(page, 'X').click({ force: true })
    await o(page, '.check-row').click()
    await o(page, '.tab[data-category="Appearance"]').click()
    await field(page, 'border-radius').locator('input').fill('16')
    await o(page, '.btn-primary').click()
    await chip(page, 'LinkedIn').click({ force: true })
    await o(page, '.tab[data-category="Layout"]').click()
    await o(page, '[data-sibling-gap="parent"] input').fill('20')

    await page.reload()
    // React renders after Courier mounts; restore waits for it.
    await expect(o(page, '.toast')).toHaveText('Restored 2 changes')
    for (const i of [0, 1, 2]) await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', i)).toBe('16px')
    await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 3)).toBe('8px')
    await expect.poll(() => css(page, '.links', 'column-gap')).toBe('20px')
    await expect(o(page, '[data-marker]')).toHaveCount(4)

    // Saved state survives too: one saved, one still unsaved.
    await o(page, '[data-courier-launcher]').click()
    await expect(o(page, '[data-saved]')).toHaveText('1')
    await o(page, '[aria-label="Copy all saved changes"]').click()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain('## Scope: ALL 3 matching elements (a.link-chip)')
    expect(text).toContain('border-radius: 8px → 16px')
    expect(text).toContain('gap: 8px → 20px')

    // Copy hands everything off, so another reload brings nothing back.
    await page.reload()
    await page.waitForTimeout(600)
    await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('8px')
    await expect(o(page, '[data-marker]')).toHaveCount(0)
  })

  test('a change whose element is gone is reported, not misapplied', async ({ page }) => {
    await open(page)
    await chip(page, 'X').click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await field(page, 'border-radius').locator('input').fill('16')
    await chip(page, 'LinkedIn').click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await field(page, 'border-radius').locator('input').fill('4')
    // Apply the typed value now (it would otherwise wait for the typing pause).
    await field(page, 'border-radius').locator('input').press('Enter')
    // Simulate the page changing between reloads: LinkedIn's classes no longer match.
    await page.evaluate(() => {
      const key = `courier:${location.pathname}`
      const items = JSON.parse(sessionStorage.getItem(key)!)
      items[1].anchor.classes = 'renamed'
      items[1].targets[0].classes = 'renamed'
      items[1].members[0].classes = 'renamed'
      items[1].anchor.selector = items[1].targets[0].selector = items[1].members[0].selector = '.renamed'
      sessionStorage.setItem(key, JSON.stringify(items))
    })
    await page.reload()
    await expect(o(page, '.toast')).toHaveText('Restored 1 change. 1 change could not be found', { timeout: 8000 })
    await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 0)).toBe('16px')
    await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius', 3)).toBe('8px')
    // The lost one is dropped, so it doesn't come back on the next reload.
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem(`courier:${location.pathname}`)!).length)).toBe(1)
  })

  test('cancel and undo are reflected in what survives', async ({ page }) => {
    await open(page)
    await chip(page, 'X').click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await field(page, 'border-radius').locator('input').fill('16')
    await o(page, '[data-cancel]').click()
    await page.reload()
    await page.waitForTimeout(600)
    await expect.poll(() => css(page, '.link-chip', 'border-top-left-radius')).toBe('8px')
    expect(await page.evaluate(() => sessionStorage.getItem(`courier:${location.pathname}`))).toBeNull()
  })
})

test.describe('removing a border', () => {
  test('a border from the code becomes border-style none, and can be restored', async ({ page }) => {
    await open(page)
    await chip(page, 'LinkedIn').click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await field(page, 'border-color').locator('input[aria-label$="hex"]').fill('#FF0000')
    await o(page, '[data-remove-border]').click()
    await expect.poll(() => css(page, '.link-chip.is-featured', 'border-top-style')).toBe('none')
    await expect(o(page, '[data-border-removed]')).toHaveText('Removed')
    await expect(o(page, '[data-add="Border"]')).toHaveCount(0)

    await o(page, '[aria-label="Copy all saved changes"]').click()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    // The colour edit is dropped: it no longer matters once the border is gone.
    expect(text).toContain('border-style: solid → none')
    expect(text).not.toContain('#FF0000')

    // Restore from the Removed row.
    await chip(page, 'LinkedIn').click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await o(page, '[data-remove-border]').click()
    await o(page, '[data-row~="border-style"] .reset').click()
    await expect.poll(() => css(page, '.link-chip.is-featured', 'border-top-style')).toBe('solid')
    await expect(field(page, 'border-color')).toBeVisible()
  })

  test('a border only Courier added is simply undone', async ({ page }) => {
    await open(page)
    await page.locator('.section h2').first().click({ force: true })
    await o(page, '.tab[data-category="Appearance"]').click()
    await o(page, '[data-add="Border"]').click()
    await expect.poll(() => css(page, '.section h2', 'border-top-width')).toBe('1px')
    await o(page, '[data-remove-border]').click()
    await expect.poll(() => css(page, '.section h2', 'border-top-style')).toBe('none')
    await expect(o(page, '[data-add="Border"]')).toBeVisible()
    await expect(o(page, '.tab[data-category="Appearance"] .tab-count')).toHaveCount(0)
  })
})
