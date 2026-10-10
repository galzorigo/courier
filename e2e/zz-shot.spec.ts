import { test } from '@playwright/test'
test('shot', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: `html,body,body *{background:#141824 !important}` })
  await page.locator('courier-overlay [data-courier-launcher]').click()
  await page.locator('h1').first().click({ force: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-galzorigoo-Desktop-Coding-projects/16e3384e-0dec-4730-8966-b22bb833787a/scratchpad/shots/edge.png', clip: { x: 860, y: 200, width: 260, height: 120 }, scale: 'device' })
})
