import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./fabrication')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./fabrication')
  await page.waitForLoadState('networkidle')
})

test.describe('fabrication page', () => {
  test('renders page title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Fabrication', level: 1 })).toBeVisible()
  })

  test('renders 6 source columns', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Chopping' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mining' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Digging' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Exploring' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Fishing' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Farming' })).toBeVisible()
  })

  test('clicking + button allocates a point', async ({ page }) => {
    // Use the first + button in the grid
    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    await plusButtons.first().click()

    // Summary bar should appear with totals
    const summaryBar = page.locator('.flex.items-center.justify-between.rounded-xl')
    await expect(summaryBar.getByText('1 point')).toBeVisible()
    await expect(summaryBar.getByText('0.3/min · 20/hr')).toBeVisible()
  })

  test('clicking - button deallocates a point', async ({ page }) => {
    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    const minusButtons = page.locator('button:has(svg.lucide-minus)')

    // Allocate then deallocate
    await plusButtons.first().click()
    await expect(page.getByText('1 point')).toBeVisible()

    await minusButtons.first().click()
    // Summary bar stays mounted; the total falls back to 0
    await expect(page.getByText('0 points')).toBeVisible()
  })

  test('multiple allocations sum correctly', async ({ page }) => {
    const plusButtons = page.locator('button:has(svg.lucide-plus)')

    // Allocate 3 points to first item
    await plusButtons.first().click()
    await plusButtons.first().click()
    await plusButtons.first().click()

    // Summary bar should show totals
    const summaryBar = page.locator('.flex.items-center.justify-between.rounded-xl')
    await expect(summaryBar.getByText('3 points')).toBeVisible()
    await expect(summaryBar.getByText('1/min · 60/hr')).toBeVisible()
  })

  test('summary bar is mounted even with zero allocations', async ({ page }) => {
    // The "Reset" button is always rendered so the layout doesn't reflow when
    // simulation deltas appear; it's just made `invisible` until there are
    // changes to revert.
    const resetBtn = page.locator('button').filter({ hasText: 'Reset' })
    await expect(resetBtn).not.toBeVisible()
    await expect(page.getByText('0 points')).toBeVisible()
  })

  test('Reset becomes visible once an allocation is added and clears it', async ({ page }) => {
    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    await plusButtons.first().click()

    const resetBtn = page.getByRole('button', { name: 'Reset' })
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()
    await expect(page.getByText('+1 simulated')).not.toBeVisible()
  })

  test('unallocated prestige-points badge shows when save inventory has prestige-points', async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem('config-inventory', JSON.stringify({ 'prestige-points': 5 }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('5 unallocated')).toBeVisible()
  })

  test('unallocated badge reflects simulated allocations', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('config-inventory', JSON.stringify({ 'prestige-points': 5 }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    await plusButtons.first().click()
    await plusButtons.first().click()

    // 5 saved + 0 removed − 2 added = 3 unallocated
    await expect(page.getByText('3 unallocated')).toBeVisible()
  })

  test('simulated chip shows when adding points', async ({ page }) => {
    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    await plusButtons.first().click()
    await expect(page.getByText('+1 simulated')).toBeVisible()
  })

  test('reset button reverts simulated changes', async ({ page }) => {
    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    await plusButtons.first().click()
    await expect(page.getByText('+1 simulated')).toBeVisible()

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(page.getByText('+1 simulated')).not.toBeVisible()
  })

  test('simulated allocations persist in separate localStorage key', async ({ page }) => {
    const plusButtons = page.locator('button:has(svg.lucide-plus)')
    await plusButtons.first().click()

    const simulated = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('fabrication-simulated') || '{}'),
    )
    expect(Object.keys(simulated).length).toBeGreaterThan(0)

    // Config should not be modified (still empty from clear)
    const config = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('config-fabrication-allocations') || '{}'),
    )
    expect(Object.keys(config).length).toBe(0)
  })
})
