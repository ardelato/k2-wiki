import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./tools')
  await page.waitForLoadState('networkidle')
})

test.describe('tools page', () => {
  test('renders page title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible()
  })

  test('renders gathering section with 6 tools', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Gathering' })).toBeVisible()
    const section = page.locator('section').filter({ hasText: 'Gathering' }).first()
    const cards = section.locator('.rounded-xl.border')
    await expect(cards).toHaveCount(6)
  })

  test('renders workstation section with 3 tools', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workstation' })).toBeVisible()
    const section = page.locator('section').filter({ hasText: 'Workstation' }).first()
    const cards = section.locator('.rounded-xl.border')
    await expect(cards).toHaveCount(3)
  })

  test('renders other section with 2 tools', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Other' })).toBeVisible()
    const section = page.locator('section').filter({ hasText: 'Other' }).first()
    const cards = section.locator('.rounded-xl.border')
    await expect(cards).toHaveCount(2)
  })

  test('tool cards show skill name', async ({ page }) => {
    await expect(page.getByText('Chopping', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Mining', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Furnace', { exact: true }).first()).toBeVisible()
  })

  test('upgrade costs table renders with 10 rows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Upgrade Costs' })).toBeVisible()
    const table = page.locator('table')
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(10)
  })
})
