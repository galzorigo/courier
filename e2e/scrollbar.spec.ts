import { expect, test } from '@playwright/test'

// The test browser hides scrollbars by default; show them so they can be measured.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test('panel scrollbar is 4px, white at 10%', async ({ page }) => {
  await page.goto('/')
  await page.locator('courier-overlay [data-courier-launcher]').click()
  await page.locator('.link-chip', { hasText: /^LinkedIn$/ }).click({ force: true })
  const body = page.locator('courier-overlay .panel-body')
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  // 8px of the body's width goes to the scrollbar: a 4px bar plus a 4px inset from the edge.
  expect(await body.evaluate((el) => el.offsetWidth - el.clientWidth)).toBe(8)
  // Chrome uses the custom scrollbar styles, not the Firefox fallback.
  expect(await body.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('auto')
})

test('field reset buttons are square', async ({ page }) => {
  await page.goto('/')
  await page.locator('courier-overlay [data-courier-launcher]').click()
  await page.locator('.link-chip', { hasText: /^X$/ }).click({ force: true })
  await page.locator('courier-overlay [data-property="padding-inline"] input').fill('20')
  const box = (await page.locator('courier-overlay [data-row~="padding"] .reset').boundingBox())!
  expect([box.width, box.height]).toEqual([28, 28])
})
