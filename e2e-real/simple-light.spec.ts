import { expect, test, type Page } from '@playwright/test'

// Courier on a real Tailwind v4 + Next.js 15 site: Cruip "Simple Light"
// (../cruip-simple-light), installed from a packed tarball. Run with
// `npm run e2e:real` while that site's dev server is on :3000.

const o = (page: Page, s: string) => page.locator(`courier-overlay ${s}`)
const featureP = (page: Page) => page.locator('article > p')

async function open(page: Page) {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await o(page, '[data-courier-launcher]').click()
}

test('utility classes stay out of names; the export carries them instead', async ({ page }) => {
  await open(page)
  await page.locator('h1').hover({ force: true })
  await expect(o(page, '[data-hl="hover"] .hl-label')).toHaveText(/^h1\s+\d+×\d+$/)
  await page.locator('h1').click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('h1')
})

test('clicking a button label picks the button', async ({ page }) => {
  await open(page)
  await page.getByText('Start Free Trial').first().click({ force: true })
  await expect(o(page, '.panel-title h2')).toHaveText('a.btn')
  await expect(o(page, '.tab[data-category="Text"]')).toBeVisible()
})

test('the same paragraph in every feature card matches, and the export names the server component', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await featureP(page).nth(1).scrollIntoViewIfNeeded()
  await featureP(page).nth(1).click({ force: true })
  await expect(o(page, '.check-row')).toContainText('Apply to all 6 matching elements')
  await o(page, '.check-row').click()
  await o(page, '.tab[data-category="Text"]').click()
  await o(page, '[data-property="color"] input[aria-label$="hex"]').fill('#FFD166')
  // Typing applies after a short pause.
  await expect
    .poll(() => featureP(page).evaluateAll((ps) => [...new Set(ps.map((p) => getComputedStyle(p).color))]))
    .toEqual(['rgb(255, 209, 102)'])

  // Survives a reload.
  await page.reload()
  await expect.poll(() => featureP(page).first().evaluate((p) => getComputedStyle(p).color)).toBe('rgb(255, 209, 102)')

  await o(page, '[data-courier-launcher]').click()
  await o(page, '[aria-label="Copy all saved changes"]').click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('## Scope: ALL 6 matching elements (p)')
  expect(text).toContain('Selector: article > p\n')
  expect(text).toContain('Classes: text-[15px] text-gray-400')
  expect(text).toContain('Component: FeaturesPlanet (server component)')
  expect(text).toContain('color: #99A1AF → #FFD166')
  expect(errors).toEqual([])
})
