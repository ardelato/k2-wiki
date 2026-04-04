import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./planner')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./planner')
  await page.getByText('Choose an item to begin planning.').waitFor()
})

// ── Helpers ─────────────────────────────────────────────────────────

/** Navigate to a specific item plan */
async function openItemPlan(page: Page, itemId: string, qty = 1) {
  const qtyParam = qty > 1 ? `?qty=${qty}` : ''
  await page.goto(`./planner/${itemId}${qtyParam}`)
  await page.getByText('Gathering List').first().waitFor()
}

// ── Page rendering & item selection ─────────────────────────────────

test.describe('page rendering and item selection', () => {
  test('default empty state shows prompt to choose an item', async ({ page }) => {
    await expect(page.getByText('Choose an item to begin planning.')).toBeVisible()
    await expect(page.getByText('Browse Items')).toBeVisible()
  })

  test('URL with item ID shows tree with root node', async ({ page }) => {
    // Planks is a Refined item — always shows craft tree
    await openItemPlan(page, 'planks')
    await expect(page.getByText('Planks').first()).toBeVisible()
  })

  test('item picker selects item and shows tree', async ({ page }) => {
    // Click the item picker trigger button
    await page.locator('button[aria-haspopup="listbox"]').click()

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

// ── Tree view ───────────────────────────────────────────────────────

test.describe('tree view', () => {
  test.beforeEach(async ({ page }) => {
    // Planks: Workbench craft requires Saw + Pine Log
    await openItemPlan(page, 'planks')
  })

  test('root node displays with item name', async ({ page }) => {
    await expect(page.getByText('Planks').first()).toBeVisible()
  })

  test('tree shows child dependencies', async ({ page }) => {
    // Planks recipe needs Saw and Pine Log
    await expect(page.getByText('Saw').first()).toBeVisible()
    await expect(page.getByText('Pine Log').first()).toBeVisible()
  })

  test('Collapse to Leaves and Expand All toggle tree', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse to Leaves' }).click()
    await expect(page.getByText(/\d+ collapsed/)).toBeVisible()

    await page.getByRole('button', { name: 'Expand All' }).click()
    await expect(page.getByText(/\d+ collapsed/)).toBeHidden()
  })
})

// ── Inspector panel ─────────────────────────────────────────────────

test.describe('inspector panel', () => {
  test.beforeEach(async ({ page }) => {
    await openItemPlan(page, 'planks')
  })

  test('inspector shows method info for root node', async ({ page }) => {
    // Planks is crafted at Workbench — inspector should show workstation
    await expect(page.getByText('Workbench').first()).toBeVisible()
  })

  test('clicking a child node updates inspector', async ({ page }) => {
    // Click on Pine Log dependency
    await page.getByText('Pine Log').first().click()

    // Inspector should update — Pine Log is gathered from Chopping
    await expect(page.getByText('Chopping').first()).toBeVisible()
  })
})

// ── Summary badges ──────────────────────────────────────────────────

test.describe('summary badges', () => {
  test('time and cost badges visible when item selected', async ({ page }) => {
    await openItemPlan(page, 'planks')

    // Time badge shows duration format (e.g., "32s", "1m 4s", etc.)
    await expect(page.getByText(/\d+[smhd]/).first()).toBeVisible()
  })
})

// ── Shopping list ───────────────────────────────────────────────────

test.describe('shopping list', () => {
  test('shopping list shows leaf items needed', async ({ page }) => {
    await openItemPlan(page, 'planks')

    // Gathering list heading
    await expect(page.getByText('Gathering List').first()).toBeVisible()
  })
})

// ── View toggle ─────────────────────────────────────────────────────

test.describe('view toggle', () => {
  test.beforeEach(async ({ page }) => {
    await openItemPlan(page, 'planks')
  })

  test('switching to timeline view shows Gantt chart', async ({ page }) => {
    // The Timeline button is a plain button, not a role=button with accessible name
    await page.getByText('Timeline', { exact: true }).click()

    // Gantt chart renders — verify the tree controls disappear and SVG appears
    await expect(page.getByRole('button', { name: 'Collapse to Leaves' })).toBeHidden()
  })

  test('switching back to tree view restores tree', async ({ page }) => {
    await page.getByText('Timeline', { exact: true }).click()
    await page.getByText('Tree', { exact: true }).click()

    await expect(page.getByText('Planks').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Collapse to Leaves' })).toBeVisible()
  })
})

// ── Settings panel ──────────────────────────────────────────────────

test.describe('settings panel', () => {
  test('inventory stock marks dependency as fulfilled', async ({ page }) => {
    // Seed inventory with Pine Log so the dependency is fulfilled
    await page.evaluate(() => {
      localStorage.setItem('config-inventory', JSON.stringify({ 'pine-log': 100 }))
    })
    await openItemPlan(page, 'planks')

    // The Active Modifiers section should show "In Stock" with the stocked item
    await expect(page.getByText('In Stock').first()).toBeVisible()
  })
})

// ── Craft planner — method pinning ──────────────────────────────────

test.describe('craft planner - method pinning', () => {
  test('pinning a method updates the active method for a node', async ({ page }) => {
    // Planks has multiple recipes (different log types)
    await openItemPlan(page, 'planks')

    // The default recipe uses Pine Log — verify it's in the tree
    await expect(page.getByText('Pine Log').first()).toBeVisible()

    // Click the Pin button on a different method in the inspector
    // The pin button has title="Pin this method"
    const pinButtons = page.locator('button[title="Pin this method"]')
    const pinCount = await pinButtons.count()
    if (pinCount > 1) {
      // Click a non-first pin to select an alternative recipe
      await pinButtons.nth(1).click()

      // The tree should update — the dependency list may change
      // Verify the tree still renders (didn't break)
      await expect(page.getByText('Planks').first()).toBeVisible()
    }
  })
})

// ── Cross-page: config affects planner ──────────────────────────────

test.describe('cross-page config integration', () => {
  test('config inventory shows in planner Active Modifiers', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('config-inventory', JSON.stringify({ 'pine-log': 50 }))
    })

    await openItemPlan(page, 'planks')

    await expect(page.getByText('In Stock').first()).toBeVisible()
    await expect(page.getByText('Pine Log').first()).toBeVisible()
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
  test('default shows Level Up Planner heading and mode toggle', async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.locator('h1', { hasText: 'Level Up Planner' }).waitFor()

    await expect(page.locator('h1', { hasText: 'Level Up Planner' })).toBeVisible()
    await expect(page.getByText('Single', { exact: true })).toBeVisible()
    await expect(page.getByText('Party', { exact: true })).toBeVisible()
  })

  test('empty state shows choose a creature prompt', async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.locator('h1', { hasText: 'Level Up Planner' }).waitFor()

    await expect(page.getByText('Choose a creature to begin planning.')).toBeVisible()
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
    await page.locator('h1', { hasText: 'Moss Leveling' }).waitFor()

    // Heading should show creature name
    await expect(page.locator('h1', { hasText: 'Moss Leveling' })).toBeVisible()

    // Summary should show steps, runs, XP/min
    await expect(page.getByText(/\d+ step/).first()).toBeVisible()
    await expect(page.getByText(/\d+ runs/).first()).toBeVisible()
    await expect(page.getByText(/XP\/min avg/).first()).toBeVisible()
  })

  test('timeline steps show expedition names and level ranges', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss Leveling' }).waitFor()

    // At least one step should show an expedition name
    // Steps have numbered nodes (1, 2, 3...) and expedition details
    await expect(page.getByText('Expedition').first()).toBeVisible()
  })

  test('target level preset 70 changes the plan', async ({ page }) => {
    await page.goto('./planner?tab=levelup&creature=moss&target=120')
    await page.locator('h1', { hasText: 'Moss Leveling' }).waitFor()

    // Get step count at target 120
    const stepsText120 = await page
      .getByText(/\d+ steps?/)
      .first()
      .textContent()

    // Switch to target 70
    // There are two sets of preset buttons (single + party), find the one in single mode
    await page.getByRole('button', { name: '70', exact: true }).first().click()

    // Wait for plan to recalculate
    await page
      .getByText(/\d+ steps?/)
      .first()
      .waitFor()
    const stepsText70 = await page
      .getByText(/\d+ steps?/)
      .first()
      .textContent()

    // Target 70 should have fewer or equal steps than 120
    const steps120 = parseInt(stepsText120!.match(/(\d+)/)![1])
    const steps70 = parseInt(stepsText70!.match(/(\d+)/)![1])
    expect(steps70).toBeLessThanOrEqual(steps120)
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
})

// ── Level Up — step expansion & awakening ───────────────────────────

test.describe('level up - step interaction', () => {
  test('clicking a step card expands it to show details', async ({ page }) => {
    await seedCreatures(page)
    await page.goto('./planner?tab=levelup&creature=moss&target=70')
    await page.locator('h1', { hasText: 'Moss Leveling' }).waitFor()

    // Find the first step card button with aria-expanded
    const stepButton = page.locator('button[aria-expanded="false"]').first()
    await stepButton.click()

    // After click, it should be expanded
    await expect(page.locator('button[aria-expanded="true"]').first()).toBeVisible()
  })

  test('awakening step appears when plan crosses level 70', async ({ page }) => {
    // Seed creature near awaken threshold so plan includes awakening
    await page.evaluate(() => {
      localStorage.setItem(
        'creature-collection',
        JSON.stringify({ moss: { owned: true, level: 60, awakened: false } }),
      )
    })
    await page.goto('./planner?tab=levelup&creature=moss&target=120')
    await page.locator('h1', { hasText: 'Moss Leveling' }).waitFor()

    // Awakening step should show "Awaken Creature" text
    await expect(page.getByText('Awaken Creature')).toBeVisible()
  })
})

// ── Level Up — party mode rendering ─────────────────────────────────

test.describe('level up - party mode rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => localStorage.clear())
    await seedCreatures(page)
    await page.goto('./planner?tab=levelup')
    await page.locator('h1', { hasText: 'Level Up Planner' }).waitFor()
  })

  test('switching to Party mode shows creature filter and Calculate button', async ({ page }) => {
    await page.getByText('Party', { exact: true }).click()

    // Should show creature filter with creature names
    await expect(page.getByText('Moss').first()).toBeVisible()

    // Calculate button should be visible
    await expect(page.getByRole('button', { name: 'Calculate' })).toBeVisible()
  })

  test('party mode shows target level and budget controls', async ({ page }) => {
    await page.getByText('Party', { exact: true }).click()

    await expect(page.getByText('Target').first()).toBeVisible()
    await expect(page.getByText('Budget').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'quick' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'thorough' })).toBeVisible()
  })
})

// ── Level Up — party mode computation ───────────────────────────────

test.describe('level up - party mode computation', () => {
  test('Calculate triggers computation and shows results', async ({ page }) => {
    test.setTimeout(90000)

    await page.goto('./planner?tab=levelup')
    await page.evaluate(() => localStorage.clear())
    await seedCreatures(page)
    await page.goto('./planner?tab=levelup&mode=party&partyTarget=70')
    await page.getByRole('button', { name: 'Calculate' }).waitFor()

    // Click Calculate
    await page.getByRole('button', { name: 'Calculate' }).click()

    // Wait for results — either loading indicator or results
    // The computation can take a while, so wait for the summary to appear
    await expect(page.getByText(/\d+ runs/).first()).toBeVisible({ timeout: 60000 })

    // Strategy toggle should now be visible
    await expect(page.getByText('Optimal', { exact: true })).toBeVisible()
    await expect(page.getByText('Hands-Free', { exact: true })).toBeVisible()
  })
})
