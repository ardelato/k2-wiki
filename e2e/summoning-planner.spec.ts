import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./planner?tab=summoning')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./planner?tab=summoning')
  await page.getByText('Creatures').first().waitFor()
})

/** Helper to get the "N of M selected" text element */
function selectedCount(page: Page) {
  return page.getByText(/\d+ of \d+ selected/)
}

/** Select all creatures in the first tier */
async function selectFirstTier(page: Page) {
  await page.getByRole('button', { name: 'Select all' }).first().click()
}

// ── Tab navigation ──────────────────────────────────────────────────

test.describe('tab navigation', () => {
  test('summoning tab is active when navigated via URL', async ({ page }) => {
    const summoningTab = page.getByRole('button', { name: 'Summoning' })
    await expect(summoningTab).toHaveClass(/bg-primary/)
  })

  test('creature filter is visible', async ({ page }) => {
    await expect(page.getByText('Creatures').first()).toBeVisible()
    await expect(selectedCount(page)).toBeVisible()
  })
})

// ── Creature selection ──────────────────────────────────────────────

test.describe('creature selection', () => {
  test('starts with 0 selected', async ({ page }) => {
    await expect(selectedCount(page)).toHaveText(/^0 of \d+ selected/)
  })

  test('tier bulk selection increases count', async ({ page }) => {
    await expect(selectedCount(page)).toHaveText(/^0 of \d+ selected/)

    await selectFirstTier(page)

    // After selecting a tier, count should show a non-zero number
    await expect(selectedCount(page)).not.toHaveText(/^0 of \d+ selected/)
  })

  test('reset clears all selections', async ({ page }) => {
    await selectFirstTier(page)
    await expect(selectedCount(page)).not.toHaveText(/^0 of \d+ selected/)

    // Click reset
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(selectedCount(page)).toHaveText(/^0 of \d+ selected/)
  })
})

// ── Sub-tab switching ───────────────────────────────────────────────

test.describe('sub-tabs', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstTier(page)
    // Wait for sub-tabs to appear
    await page.getByRole('button', { name: 'Summary' }).waitFor()
  })

  test('summary tab shows totals', async ({ page }) => {
    await expect(page.getByText('Total').first()).toBeVisible()
    await expect(page.getByText(/\d+ materials/)).toBeVisible()
  })

  test('trees sub-tab renders', async ({ page }) => {
    await page.getByRole('button', { name: 'Trees' }).click()
    await expect(page.getByText('Materials').first()).toBeVisible()
  })

  test('timeline sub-tab renders', async ({ page }) => {
    await page.getByRole('button', { name: 'Timeline' }).click()
    await expect(page.getByText(/Estimated|Priority Steps/).first()).toBeVisible()
  })
})
