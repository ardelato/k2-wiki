import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./planner')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./planner')
  await page.getByText('No item selected yet.').waitFor()
})

// ── Helpers ─────────────────────────────────────────────────────────

/** Navigate to a specific item plan — default view is now "List" */
async function openItemPlan(page: Page, itemId: string, qty = 1) {
  const qtyParam = qty > 1 ? `?qty=${qty}` : ''
  await page.goto(`./planner/${itemId}${qtyParam}`)
  // Wait for list view to render — group headers like "Gather", "Craft" appear
  await page.getByText('List').first().waitFor()
}

// ── Page rendering & item selection ─────────────────────────────────

test.describe('page rendering and item selection', () => {
  test('default empty state shows prompt to choose an item', async ({ page }) => {
    await expect(page.getByText('No item selected yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose an item' })).toBeVisible()
  })

  test('URL with item ID shows planner with root item', async ({ page }) => {
    // Planks is a Refined item — shows in list view
    await openItemPlan(page, 'planks')
    await expect(page.getByText('Planks').first()).toBeVisible()
  })

  test('item picker selects item and shows planner', async ({ page }) => {
    // Open the modal item picker from the empty-state button
    await page.getByRole('button', { name: 'Choose an item' }).click()

    // Search and select
    await page.getByPlaceholder('Search items...').fill('Planks')
    await page.getByRole('button', { name: 'Planks' }).first().click()

    await expect(page.getByText('Planks').first()).toBeVisible()
  })

  test('quantity param sets initial quantity', async ({ page }) => {
    await openItemPlan(page, 'planks', 10)

    const qtyInput = page.locator('input[type="number"]').first()
    await expect(qtyInput).toHaveValue('10')
  })
})

// ── Quantity controls ───────────────────────────────────────────────

test.describe('quantity controls', () => {
  test.beforeEach(async ({ page }) => {
    await openItemPlan(page, 'planks')
  })

  test('+/- buttons increment and decrement quantity', async ({ page }) => {
    const qtyInput = page.locator('input[type="number"]').first()
    await expect(qtyInput).toHaveValue('1')

    await page.getByRole('button', { name: '+', exact: true }).first().click()
    await expect(qtyInput).toHaveValue('2')

    await page.getByRole('button', { name: '-', exact: true }).first().click()
    await expect(qtyInput).toHaveValue('1')
  })

  test('step size buttons change the increment', async ({ page }) => {
    await page.getByRole('button', { name: 'x10', exact: true }).click()
    await page.getByRole('button', { name: '+', exact: true }).first().click()

    const qtyInput = page.locator('input[type="number"]').first()
    await expect(qtyInput).toHaveValue('10')
  })

  test('quantity updates URL', async ({ page }) => {
    await page.getByRole('button', { name: '+', exact: true }).first().click()
    await expect(page).toHaveURL(/qty=2/)
  })
})

// ── List view (default) ─────────────────────────────────────────────

test.describe('list view', () => {
  test.beforeEach(async ({ page }) => {
    await openItemPlan(page, 'planks')
  })

  test('list view shows gather group with dependencies', async ({ page }) => {
    // Planks needs Pine Log (gathered) and Saw (gathered)
    await expect(page.getByText('Gather').first()).toBeVisible()
    await expect(page.getByText('Pine Log').first()).toBeVisible()
  })

  test('Collapse All and Expand All toggle groups', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse All' }).click()
    // After collapse, group rows are hidden
    await expect(page.getByText('Pine Log').first()).toBeHidden()

    await page.getByRole('button', { name: 'Expand All' }).click()
    await expect(page.getByText('Pine Log').first()).toBeVisible()
  })
})

// ── Tree view ───────────────────────────────────────────────────────

test.describe('tree view', () => {
  test.beforeEach(async ({ page }) => {
    // Planks: Workbench craft requires Saw + Pine Log
    await openItemPlan(page, 'planks')
    // Switch to Tree view
    await page.getByText('Tree', { exact: true }).click()
  })

  test('root node displays with item name', async ({ page }) => {
    await expect(page.getByText('Planks').first()).toBeVisible()
  })

  test('tree shows child dependencies', async ({ page }) => {
    // Planks is crafted from Pine Log (v2 omits tools like Saw from the dependency tree).
    await expect(page.getByText('Pine Log').first()).toBeVisible()
  })

  test('Collapse All and Expand All toggle tree', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse All' }).click()
    await expect(page.getByText(/\d+ collapsed/)).toBeVisible()

    await page.getByRole('button', { name: 'Expand All' }).click()
    await expect(page.getByText(/\d+ collapsed/)).toBeHidden()
  })
})

// ── Planner heading ─────────────────────────────────────────────────

test.describe('planner heading', () => {
  test('heading shows item name when selected', async ({ page }) => {
    await openItemPlan(page, 'planks')

    // v2 shows the selected item in the CraftPlannerHero (name in a bold span, no "X Planner" h1).
    await expect(page.locator('span.font-bold', { hasText: 'Planks' }).first()).toBeVisible()
  })
})

// ── View toggle ─────────────────────────────────────────────────────

test.describe('view toggle', () => {
  test.beforeEach(async ({ page }) => {
    await openItemPlan(page, 'planks')
  })

  test('switching to timeline view shows Gantt chart', async ({ page }) => {
    await page.getByText('Timeline', { exact: true }).click()

    // Gantt chart renders — tree controls disappear
    await expect(page.getByRole('button', { name: 'Collapse All' })).toBeHidden()
  })

  test('switching to tree view and back to list restores list', async ({ page }) => {
    await page.getByText('Tree', { exact: true }).click()
    await expect(page.getByText('Planks').first()).toBeVisible()

    await page.getByText('List', { exact: true }).click()
    await expect(page.getByText('Gather').first()).toBeVisible()
  })
})

// ── Inventory stock ─────────────────────────────────────────────────

test.describe('inventory stock', () => {
  test('inventory stock marks dependency as fulfilled in tree view', async ({ page }) => {
    // Seed inventory with Pine Log so the dependency is fulfilled
    await page.evaluate(() => {
      localStorage.setItem('config-inventory', JSON.stringify({ 'pine-log': 100 }))
    })
    await openItemPlan(page, 'planks')

    // Switch to tree view where "In stock" badges appear on fulfilled nodes
    await page.getByText('Tree', { exact: true }).click()
    await expect(page.getByText('In stock').first()).toBeVisible()
  })

  test('config inventory shows fulfilled node in tree view', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('config-inventory', JSON.stringify({ 'pine-log': 50 }))
    })

    await openItemPlan(page, 'planks')
    await page.getByText('Tree', { exact: true }).click()

    await expect(page.getByText('In stock').first()).toBeVisible()
    await expect(page.getByText('Pine Log').first()).toBeVisible()
  })
})

// ── Machine and fabrication methods ─────────────────────────────────

test.describe('machine and fabrication methods', () => {
  test('copper-bar shows tree with dependencies', async ({ page }) => {
    await openItemPlan(page, 'copper-bar')
    await page.getByText('Tree', { exact: true }).click()
    await expect(page.getByText('Copper Bar').first()).toBeVisible()
    // Copper Bar requires Copper Ore as input
    await expect(page.getByText('Copper Ore').first()).toBeVisible()
  })

  test('stone renders in planner', async ({ page }) => {
    await openItemPlan(page, 'stone')
    await expect(page.getByText('Stone').first()).toBeVisible()
  })
})

// ══════════════════════════════════════════════════════════════════════
// CREATURE PLANNER — Awaken-rush & Prestige-loop (v2 tabs)
// ══════════════════════════════════════════════════════════════════════
//
// v2 moved level planning into the Creature planner shell at /planner/creature,
// with Summon / Awaken / Prestige tabs (the old ?tab=levelup query and the
// per-creature single-leveling deep-link were removed). Landing on the creature
// planner auto-launches the first-run tour, so tests suppress it first.

/** Suppress the first-run guided tour so its overlay doesn't intercept clicks. */
async function suppressTour(page: Page) {
  await page.evaluate(() => localStorage.setItem('planner-tour-seen-v2', 'true'))
}

/** Seed an awakened, max-level roster so the prestige loop has eligible creatures. */
async function seedAwakenedRoster(page: Page, ids: string[]) {
  await page.evaluate((list) => {
    const col: Record<string, { owned: boolean; level: number; awakened: boolean }> = {}
    for (const id of list) col[id] = { owned: true, level: 120, awakened: true }
    localStorage.setItem('creature-collection', JSON.stringify(col))
  }, ids)
}

// ── Creature planner tabs ───────────────────────────────────────────

test.describe('creature planner - tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./planner/creature')
    await page.evaluate(() => localStorage.clear())
    await suppressTour(page)
    await page.goto('./planner/creature')
  })

  test('shows Summon, Awaken, and Prestige tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Summon', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Awaken', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prestige', exact: true })).toBeVisible()
  })

  test('awaken tab shows the awaken-rush heading and empty prompt', async ({ page }) => {
    await page.goto('./planner/creature?tab=awaken')
    await page.locator('h1', { hasText: 'Awaken Rush' }).waitFor()
    await expect(page.getByText('Add a creature to plan an awaken.')).toBeVisible()
  })

  test('switching to the Prestige tab updates the URL and heading', async ({ page }) => {
    await page.goto('./planner/creature?tab=awaken')
    await page.locator('h1', { hasText: 'Awaken Rush' }).waitFor()

    await page.getByRole('button', { name: 'Prestige', exact: true }).click()
    await expect(page).toHaveURL(/tab=prestige/)
    await expect(page.locator('h1', { hasText: 'Prestige Loop' })).toBeVisible()
  })
})

// ── Prestige-loop ───────────────────────────────────────────────────

test.describe('prestige-loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./planner/creature')
    await page.evaluate(() => localStorage.clear())
    await suppressTour(page)
  })

  test('shows cadence controls and the eligibility empty state', async ({ page }) => {
    await page.goto('./planner/creature?tab=prestige')
    await page.locator('h1', { hasText: 'Prestige Loop' }).waitFor()

    await expect(page.getByText('Check-in cadence')).toBeVisible()
    await expect(page.getByText('No prestige-eligible creatures yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to Awaken-rush' })).toBeVisible()
  })

  test('computes a stable setup for an awakened roster', async ({ page }) => {
    test.setTimeout(90000)
    await seedAwakenedRoster(page, [
      'moss',
      'scoots',
      'slick',
      'chroma',
      'sunny',
      'mizu',
      'ranger',
      'baabaa',
    ])
    await page.goto('./planner/creature?tab=prestige')
    await page.locator('h1', { hasText: 'Prestige Loop' }).waitFor()

    await page.getByRole('button', { name: 'Calculate' }).click()
    await expect(page.getByText('Recommended setup')).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('prestige tokens / day').first()).toBeVisible()
  })
})
