import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./planner')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./planner')
  await page.getByText('Choose an item to begin planning.').waitFor()
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
    await expect(page.getByText('Choose an item to begin planning.')).toBeVisible()
    await expect(page.getByText('Browse Items')).toBeVisible()
  })

  test('URL with item ID shows planner with root item', async ({ page }) => {
    // Planks is a Refined item — shows in list view
    await openItemPlan(page, 'planks')
    await expect(page.getByText('Planks').first()).toBeVisible()
  })

  test('item picker selects item and shows planner', async ({ page }) => {
    // Click the item picker trigger button
    await page.locator('main button[aria-haspopup="listbox"]').click()

    // Search and select
    await page.getByPlaceholder('Search planner items').fill('Planks')
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
    // Planks recipe needs Saw and Pine Log
    await expect(page.getByText('Saw').first()).toBeVisible()
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

    await expect(page.locator('h1', { hasText: 'Planks Planner' })).toBeVisible()
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
// LEVEL UP PLANNER
// ══════════════════════════════════════════════════════════════════════

/** Seed owned creatures for level planner tests */
async function seedCreatures(page: Page) {
  const creatures: Record<string, { owned: boolean; level: number; awakened: boolean }> = {
    moss: { owned: true, level: 10, awakened: false },
    scoots: { owned: true, level: 5, awakened: false },
    slick: { owned: true, level: 15, awakened: false },
    chroma: { owned: true, level: 8, awakened: false },
    sunny: { owned: true, level: 12, awakened: false },
  }
  await page.evaluate(
    (data) => localStorage.setItem('creature-collection', JSON.stringify(data)),
    creatures,
  )
}

// ── Level Up — single mode rendering ────────────────────────────────

test.describe('level up - single mode rendering', () => {
  test('default objective is Awaken-rush with an objective selector', async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.locator('h1', { hasText: 'Awaken Rush' }).waitFor()

    // Objective selector offers both objectives
    await expect(page.getByRole('button', { name: 'Awaken-rush' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prestige-loop' })).toBeVisible()
  })

  test('empty state shows choose a creature prompt', async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.locator('h1', { hasText: 'Awaken Rush' }).waitFor()

    await expect(page.getByText('Choose a creature to begin planning.')).toBeVisible()
  })
})

// ── Level Up — objectives (#9) ──────────────────────────────────────

test.describe('level up - objectives', () => {
  test('switching objective updates the URL and heading', async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.locator('h1', { hasText: 'Awaken Rush' }).waitFor()

    await page.getByRole('button', { name: 'Prestige-loop' }).click()
    await expect(page).toHaveURL(/objective=prestige-loop/)
    await expect(page.locator('h1', { hasText: 'Prestige Loop' })).toBeVisible()
  })

  test('awaken-rush pins the target to level 70', async ({ page }) => {
    await page.goto('./planner?tab=levelup&objective=awaken-rush')
    await page.locator('h1', { hasText: 'Awaken Rush' }).waitFor()
    await expect(page.getByText('Awaken target · LVL 70')).toBeVisible()
  })

  test('prestige-loop shows controls and the eligibility empty state', async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => localStorage.clear())
    await page.goto('./planner?tab=levelup&objective=prestige-loop')
    await page.locator('h1', { hasText: 'Prestige Loop' }).waitFor()

    // Cadence / strategy controls are first-class
    await expect(page.getByText('Check in every')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Anchor' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rotation' })).toBeVisible()

    // No awakened creatures → guidance to Awaken-rush
    await expect(page.getByText('No prestige-eligible creatures yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to Awaken-rush' })).toBeVisible()
  })

  test('prestige-loop computes a stable setup for an awakened roster', async ({ page }) => {
    test.setTimeout(90000)
    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => {
      const ids = ['moss', 'scoots', 'slick', 'chroma', 'sunny', 'mizu', 'ranger', 'baabaa']
      const col: Record<string, { owned: boolean; level: number; awakened: boolean }> = {}
      for (const id of ids) col[id] = { owned: true, level: 120, awakened: true }
      localStorage.setItem('creature-collection', JSON.stringify(col))
    })
    await page.goto('./planner?tab=levelup&objective=prestige-loop')
    await page.locator('h1', { hasText: 'Prestige Loop' }).waitFor()

    await page.getByRole('button', { name: 'Calculate' }).click()

    // Headline metric + recommended setup render
    await expect(page.getByText(/tokens\/hr/).first()).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Recommended setup')).toBeVisible()
    await expect(page.getByText('Strategy comparison')).toBeVisible()
    // Booster count is fixed (no picker)
    await expect(page.getByText(/K=3/).first()).toBeVisible()
  })

  test('timeline tab shows the per-check-in evolution', async ({ page }) => {
    test.setTimeout(90000)
    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => {
      const ids = [
        'moss',
        'scoots',
        'slick',
        'chroma',
        'sunny',
        'mizu',
        'ranger',
        'baabaa',
        'tato',
        'bolt',
      ]
      const col: Record<string, { owned: boolean; level: number; awakened: boolean }> = {}
      for (const id of ids) col[id] = { owned: true, level: 120, awakened: true }
      localStorage.setItem('creature-collection', JSON.stringify(col))
    })
    await page.goto('./planner?tab=levelup&objective=prestige-loop')
    await page.locator('h1', { hasText: 'Prestige Loop' }).waitFor()
    await page.getByRole('button', { name: 'Calculate' }).click()
    await expect(page.getByText('Recommended setup')).toBeVisible({ timeout: 60000 })

    // Timeline is available for every strategy (no longer a rotation-only drawer).
    await page.getByRole('button', { name: 'Timeline' }).click()
    await expect(page.getByRole('button', { name: 'By creature' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'By expedition' })).toBeVisible()
    // By-creature lens renders a per-creature fate row with a Tokens column.
    await expect(page.getByText('Tokens', { exact: false }).first()).toBeVisible()
  })
})

// ── Level Up — single mode planning ─────────────────────────────────

test.describe('level up - single mode planning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => localStorage.clear())
    await seedCreatures(page)
  })

  test('selecting creature via URL shows leveling plan', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Heading should show creature name
    await expect(page.locator('h1', { hasText: 'Moss' })).toBeVisible()

    // Single-mode plan is gated behind an explicit Calculate button
    await page.getByRole('button', { name: 'Calculate' }).first().click()

    // Summary should show steps, runs, XP/min
    await expect(page.getByText(/\d+ step/).first()).toBeVisible()
    await expect(page.getByText(/\d+ runs/).first()).toBeVisible()
    await expect(page.getByText(/XP\/min avg/).first()).toBeVisible()
  })

  test('timeline steps show expedition names and level ranges', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()
    await page.getByRole('button', { name: 'Calculate' }).first().click()

    // At least one step should show an expedition name
    // Steps have numbered nodes (1, 2, 3...) and expedition details
    await expect(page.getByText('Expedition').first()).toBeVisible()
  })

  test('creature at max level shows already max message', async ({ page }) => {
    // Seed moss at level 70 (pre-awaken max)
    await page.evaluate(() => {
      const coll = JSON.parse(localStorage.getItem('creature-collection') || '{}')
      coll.moss = { owned: true, level: 70, awakened: false }
      localStorage.setItem('creature-collection', JSON.stringify(coll))
    })
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.getByText('Already at max level!').waitFor()
  })

  test('awaken-rush shows "already awakened" for an awakened creature', async ({ page }) => {
    // Regression: an awakened creature past level 70 yielded a zero-step plan and
    // rendered nothing under Awaken-rush. It should now show the cleared state.
    await page.evaluate(() => {
      const coll = JSON.parse(localStorage.getItem('creature-collection') || '{}')
      coll.moss = { owned: true, level: 80, awakened: true }
      localStorage.setItem('creature-collection', JSON.stringify(coll))
    })
    await page.goto('./planner?tab=levelup&objective=awaken-rush&creature=moss')
    await expect(page.getByText('Already awakened.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go to Prestige-loop' })).toBeVisible()
  })
})

// ── Level Up — step expansion & awakening ───────────────────────────

test.describe('level up - step interaction', () => {
  test('clicking a step card expands it to show details', async ({ page }) => {
    await seedCreatures(page)
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()
    await page.getByRole('button', { name: 'Calculate' }).first().click()

    // Find the first step card button with aria-expanded
    const stepButton = page.locator('button[aria-expanded="false"]').first()
    await stepButton.click()

    // After click, it should be expanded
    await expect(page.locator('button[aria-expanded="true"]').first()).toBeVisible()
  })
})

// ── Level Up — expedition filter ─────────────────────────────────────

test.describe('level up - expedition filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => localStorage.clear())
    await seedCreatures(page)
  })

  test('expedition filter is visible in single mode', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Collapsible header should show expedition count
    await expect(page.getByText(/\d+ of \d+ included/).first()).toBeVisible()
    await expect(page.getByText('Expeditions', { exact: true }).first()).toBeVisible()
  })

  test('expanding expedition filter shows list with tier skull icons', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Click to expand
    await page.getByText('Expeditions', { exact: true }).first().click()

    // Should show expedition names and skull icons
    await expect(page.getByText('Expedition Training').first()).toBeVisible()
    await expect(page.locator('img[alt="Tier 1"]').first()).toBeVisible()
  })

  test('Include All button toggles all expeditions', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Expand
    await page.getByText('Expeditions', { exact: true }).first().click()

    // Click Include All
    await page.getByRole('button', { name: 'Include All' }).click()

    // Should show all expeditions included (20 of 20)
    await expect(page.getByText('20 of 20 included')).toBeVisible()
  })

  test('expedition filter persists after page refresh', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Expand and toggle Include All
    await page.getByText('Expeditions', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Include All' }).click()
    await expect(page.getByText('20 of 20 included')).toBeVisible()

    // Refresh
    await page.reload()
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Should still show as filtered
    await expect(page.getByText('20 of 20 included')).toBeVisible()
  })

  test('Reset button clears overrides', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss' }).waitFor()

    // Locate the expedition filter section
    const expSection = page.locator('.surface-card', { hasText: 'Expeditions' }).first()

    // Expand and toggle Include All
    await page.getByText('Expeditions', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Include All' }).click()
    await expect(expSection.getByText('Filtered')).toBeVisible()

    // Click Reset within expedition section
    await expSection.getByRole('button', { name: 'Reset', exact: true }).click()

    // Filtered badge should be gone from expedition section
    await expect(expSection.getByText('Filtered')).toBeHidden()
  })
})
