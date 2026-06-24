import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await page.waitForLoadState('networkidle')
})

test.describe('sidebar navigation', () => {
  test('sidebar renders section headers on desktop', async ({ page }) => {
    // Expand sidebar first
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()

    await expect(page.getByText('Reference')).toBeVisible()
    await expect(page.getByText('Progression')).toBeVisible()
    await expect(page.getByText('Utilities')).toBeVisible()
  })

  test('sidebar has all nav items', async ({ page }) => {
    // Expand sidebar
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()

    await expect(page.getByRole('link', { name: 'Beastiary' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Items' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Expeditions' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Machines' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tools' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fabrication' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Creature Planner' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Crafting Planner' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Garden' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Awaken Tree' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Configs' })).toBeVisible()
  })

  test('Garden link navigates to /garden', async ({ page }) => {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    await page.getByRole('link', { name: 'Garden' }).click()
    await expect(page).toHaveURL(/\/garden/)
    await expect(page.getByRole('heading', { name: 'Garden', level: 1 })).toBeVisible()
  })

  test('Awaken Tree link navigates to /awaken', async ({ page }) => {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    await page.getByRole('link', { name: 'Awaken Tree' }).click()
    await expect(page).toHaveURL(/\/awaken/)
    await expect(page.getByRole('heading', { name: 'Awaken Tree', level: 1 })).toBeVisible()
  })

  test('clicking nav item navigates to correct page', async ({ page }) => {
    // Expand sidebar
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()

    await page.getByRole('link', { name: 'Machines' }).click()
    await expect(page).toHaveURL(/\/machines/)
    await expect(page.getByRole('heading', { name: 'Machines', level: 1 })).toBeVisible()
  })

  test('collapse button toggles sidebar width', async ({ page }) => {
    const sidebar = page.locator('aside').first()

    // Default is collapsed — get initial width
    const collapsedWidth = await sidebar.evaluate((el) => el.offsetWidth)

    // Expand
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    // Wait for transition
    await page.waitForTimeout(300)
    const expandedWidth = await sidebar.evaluate((el) => el.offsetWidth)
    expect(expandedWidth).toBeGreaterThan(collapsedWidth)

    // Collapse again
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    await page.waitForTimeout(300)
    const reCollapsedWidth = await sidebar.evaluate((el) => el.offsetWidth)
    expect(reCollapsedWidth).toBe(collapsedWidth)
  })

  test('footer disclaimer is visible', async ({ page }) => {
    await expect(page.getByText('unofficial fan project', { exact: false })).toBeVisible()
  })
})
