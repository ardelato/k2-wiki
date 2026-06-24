import { test, expect, type Page } from '@playwright/test'

// v2 moved the summoning planner into the Creature planner shell (/planner/creature,
// the default "Summon" tab) and put creature selection inside an "Add / Remove creatures"
// modal (the old inline tier filter and List/Tree/Timeline view tabs were removed).
// Landing on the creature planner auto-launches the first-run tour, so suppress it first.
test.beforeEach(async ({ page }) => {
  await page.goto('./planner/creature')
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('planner-tour-seen-v2', 'true')
  })
  await page.goto('./planner/creature')
  await page.getByText('Creatures').first().waitFor()
})

/** Open the "Add / Remove creatures" picker modal. */
async function openCreaturePicker(page: Page) {
  await page
    .getByRole('button', { name: /Add \/ Remove creatures/ })
    .first()
    .click()
}

/** The "N selected" counter (lives inside the picker modal). */
function selectedCount(page: Page) {
  return page.getByText(/\d+ selected/).first()
}

// ── Tab navigation ──────────────────────────────────────────────────

test.describe('tab navigation', () => {
  test('Summon tab is active on the creature planner', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Summon', exact: true })).toHaveClass(
      /bg-primary/,
    )
  })

  test('creature section and picker trigger are visible', async ({ page }) => {
    await expect(page.getByText('Creatures').first()).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Add \/ Remove creatures/ }).first(),
    ).toBeVisible()
  })
})

// ── Creature selection (picker modal) ───────────────────────────────

test.describe('creature selection', () => {
  test('starts with 0 selected', async ({ page }) => {
    await openCreaturePicker(page)
    await expect(selectedCount(page)).toHaveText(/^0 selected/)
  })

  test('tier bulk selection increases the count', async ({ page }) => {
    await openCreaturePicker(page)
    await expect(selectedCount(page)).toHaveText(/^0 selected/)

    await page.getByRole('button', { name: 'Select all' }).first().click()
    await expect(selectedCount(page)).not.toHaveText(/^0 selected/)
  })

  test('deselect all clears the selection', async ({ page }) => {
    await openCreaturePicker(page)
    await page.getByRole('button', { name: 'Select all' }).first().click()
    await expect(selectedCount(page)).not.toHaveText(/^0 selected/)

    await page.getByRole('button', { name: 'Deselect all' }).first().click()
    await expect(selectedCount(page)).toHaveText(/^0 selected/)
  })
})
