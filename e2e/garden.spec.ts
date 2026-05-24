import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./garden')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./garden')
  await page.locator('h1', { hasText: 'Garden' }).waitFor()
})

/** Click the Nth grid cell (0-based). The bed has 25 cells in document order. */
async function clickCell(page: Page, index: number) {
  // The bed lives inside a `grid-cols-5` container — match it specifically to
  // avoid colliding with the planting picker (also a `grid-cols-5`).
  const bed = page.locator('.grid-cols-5.gap-1\\.5').first()
  await bed.locator('button').nth(index).click()
}

test.describe('page rendering', () => {
  test('shows header and empty bed totals', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Garden' })).toBeVisible()
    await expect(page.getByText('0 of 25 planted')).toBeVisible()
  })

  test('shows flower summary list with all five flower types', async ({ page }) => {
    await expect(page.getByText('Fire Flower')).toBeVisible()
    await expect(page.getByText('Wind Flower')).toBeVisible()
    await expect(page.getByText('Earth Flower')).toBeVisible()
    await expect(page.getByText('Water Flower')).toBeVisible()
    await expect(page.getByText('Gold Flower')).toBeVisible()
  })

  test('selection panel prompts when nothing is selected', async ({ page }) => {
    await expect(
      page.getByText('Select a plot to plant, level up, or remove a flower.'),
    ).toBeVisible()
  })
})

test.describe('planting and editing', () => {
  test('clicking an empty plot shows the plant-a-flower picker', async ({ page }) => {
    await clickCell(page, 0)
    await expect(page.getByText('Plant a flower')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Plant Fire Flower' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Plant Gold Flower' })).toBeVisible()
  })

  test('planting a flower fills the cell and updates the bed total', async ({ page }) => {
    await clickCell(page, 0)
    await page.getByRole('button', { name: 'Plant Fire Flower' }).click()

    await expect(page.getByText('1 of 25 planted')).toBeVisible()
    // The occupied-cell selection panel surfaces the flower name and level
    await expect(page.locator('text=Fire Flower').first()).toBeVisible()
    await expect(page.getByText('Level 1/6')).toBeVisible()
  })

  test('levelling up an occupied plot increases the level badge', async ({ page }) => {
    await clickCell(page, 0)
    await page.getByRole('button', { name: 'Plant Fire Flower' }).click()

    // The selection panel's +1 button increments level
    await page.getByRole('button', { name: /\+1/ }).click()
    await expect(page.getByText('Level 2/6')).toBeVisible()
  })

  test('removing a flower returns the plot to empty', async ({ page }) => {
    await clickCell(page, 0)
    await page.getByRole('button', { name: 'Plant Wind Flower' }).click()
    await expect(page.getByText('1 of 25 planted')).toBeVisible()

    await page.getByRole('button', { name: 'Remove flower from bed' }).click()
    await expect(page.getByText('0 of 25 planted')).toBeVisible()
  })

  test('changing the flower on an occupied plot keeps the level', async ({ page }) => {
    await clickCell(page, 0)
    await page.getByRole('button', { name: 'Plant Fire Flower' }).click()
    await page.getByRole('button', { name: /\+1/ }).click()
    await expect(page.getByText('Level 2/6')).toBeVisible()

    await page.getByRole('button', { name: 'Change to Earth Flower' }).click()
    await expect(page.getByText('Level 2/6')).toBeVisible()
  })

  test('planted state persists across reload', async ({ page }) => {
    await clickCell(page, 0)
    await page.getByRole('button', { name: 'Plant Gold Flower' }).click()
    await expect(page.getByText('1 of 25 planted')).toBeVisible()

    await page.reload()
    await page.locator('h1', { hasText: 'Garden' }).waitFor()
    await expect(page.getByText('1 of 25 planted')).toBeVisible()
  })
})

test.describe('reset', () => {
  test('Reset is hidden when the bed is empty', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Reset' })).not.toBeVisible()
  })

  test('Reset appears after planting and clears the bed when clicked', async ({ page }) => {
    await clickCell(page, 0)
    await page.getByRole('button', { name: 'Plant Fire Flower' }).click()
    await expect(page.getByText('1 of 25 planted')).toBeVisible()

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(page.getByText('0 of 25 planted')).toBeVisible()
  })
})
