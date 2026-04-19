import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./planner?tab=summoning')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./planner?tab=summoning')
  await page.getByText('Creatures').first().waitFor()
})

/** Helper to get the "N selected" text element */
function selectedCount(page: Page) {
  return page.getByText(/\d+ selected/)
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
    await expect(selectedCount(page)).toHaveText(/^0 selected/)
  })

  test('tier bulk selection increases count', async ({ page }) => {
    await expect(selectedCount(page)).toHaveText(/^0 selected/)

    await selectFirstTier(page)

    // After selecting a tier, count should show a non-zero number
    await expect(selectedCount(page)).not.toHaveText(/^0 selected/)
  })

  test('reset clears all selections', async ({ page }) => {
    await selectFirstTier(page)
    await expect(selectedCount(page)).not.toHaveText(/^0 selected/)

    // Click reset (only visible when selections exist)
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(selectedCount(page)).toHaveText(/^0 selected/)
  })
})

// ── Cost accuracy after toggling tiers ───────────────────────────────

test.describe('cost accuracy', () => {
  test('selected count returns to original after toggling a second tier', async ({ page }) => {
    // 1. Select tier 1 and capture the selected count
    await selectFirstTier(page)
    await page.getByRole('button', { name: 'List' }).waitFor()
    const originalText = await selectedCount(page).textContent()

    // 2. Select tier 2 — count changes
    const selectButtons = page.getByRole('button', { name: 'Select all' })
    await selectButtons.nth(1).click()
    await expect(selectedCount(page)).not.toHaveText(originalText!)

    // 3. Deselect tier 2 — count must return to the original
    const deselectButtons = page.getByRole('button', { name: 'Deselect all' })
    await deselectButtons.nth(1).click()
    await expect(selectedCount(page)).toHaveText(originalText!)
  })
})

// ── View tab switching ──────────────────────────────────────────────

test.describe('view tabs', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstTier(page)
    // Wait for view tabs to appear (List is the default)
    await page.getByRole('button', { name: 'List' }).waitFor()
  })

  test('list tab shows source groups', async ({ page }) => {
    // List view groups materials by source type (Refined, Gathered, Expedition, etc.)
    // At least one group header should be visible
    await expect(
      page.getByText(/Refined Materials|Gathered Resources|Expedition Rewards/).first(),
    ).toBeVisible()
  })

  test('tree tab renders material trees', async ({ page }) => {
    await page.getByRole('button', { name: 'Tree' }).click()
    // Tree view shows crafting dependency trees with item names
    await expect(page.locator('.surface-card').first()).toBeVisible()
  })

  test('timeline tab renders', async ({ page }) => {
    await page.getByRole('button', { name: 'Timeline' }).click()
    await expect(page.getByText(/Priority Steps/).first()).toBeVisible()
  })
})
