import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./machines')
  await page.waitForLoadState('networkidle')
})

test.describe('machines page', () => {
  test('renders page title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Machines', level: 1 })).toBeVisible()
  })

  test('renders generators section with 3 machines', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Generators' })).toBeVisible()
    const generatorSection = page.locator('section').filter({ hasText: 'Generators' })
    const cards = generatorSection.locator('.rounded-xl.border')
    await expect(cards).toHaveCount(3)
  })

  test('renders processors section with 6 machines', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Processors' })).toBeVisible()
    const processorSection = page.locator('section').filter({ hasText: 'Processors' })
    const cards = processorSection.locator(':scope > div > div.overflow-hidden')
    await expect(cards).toHaveCount(6)
  })

  test('processor recipe toggle opens and closes', async ({ page }) => {
    const recipeButton = page.getByRole('button', { name: /Recipes \(\d+\)/ }).first()
    await expect(recipeButton).toBeVisible()

    // Click to expand
    await recipeButton.click()
    const recipeList = page.locator('.space-y-1\\.5').first()
    await expect(recipeList).toBeVisible()

    // Click to collapse
    await recipeButton.click()
  })

  test('upgrade costs table renders with 11 rows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Upgrade Costs' })).toBeVisible()
    const table = page.locator('table')
    const rows = table.locator('tbody tr')
    // 1 base row (level 0) + 10 upgrade levels
    await expect(rows).toHaveCount(11)
  })

  test('upgrade table has machine image columns', async ({ page }) => {
    const table = page.locator('table')
    const headerImages = table.locator('thead img')
    // 9 machines
    await expect(headerImages).toHaveCount(9)
  })

  test('generator cards show gold cost with image', async ({ page }) => {
    const generatorSection = page.locator('section').filter({ hasText: 'Generators' })
    const goldImages = generatorSection.locator('img[alt=""]').first()
    await expect(goldImages).toBeVisible()
  })
})
