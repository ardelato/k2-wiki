import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await page.locator('img[alt="Not summoned"]').first().waitFor()
})

// ── Card state validation ─────────────────────────────────────────────
// These tests verify that card indicators (icons, level text) accurately
// reflect creature state after bulk operations.

test.describe('card state validation', () => {
  test('card icons reflect summoned state', async ({ page }) => {
    // Initially all cards show "Not summoned" alt
    await expect(page.locator('img[alt="Not summoned"]')).toHaveCount(120)

    // Summon all creatures
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    // After: 120 summoned, all cards show "Summoned" alt
    await expect(page.locator('img[alt="Summoned"]')).toHaveCount(120)
  })

  test('awakened card icons match after bulk awaken', async ({ page }) => {
    // Summon and awaken all
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Awaken', exact: true }).first().click()
    await page.getByRole('button', { name: 'Done' }).click()

    // All cards should show "Awakened" alt
    await expect(page.locator('img[alt="Awakened"]')).toHaveCount(120)

    // Verify via drawer: open first creature, awakened switch should be checked
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')
    const awakenedSwitch = drawer.locator('button[role="switch"]').nth(1)
    await expect(awakenedSwitch).toHaveAttribute('aria-checked', 'true')
  })

  test('level display on cards matches after bulk set level', async ({ page }) => {
    // Summon all and set level to 25
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    const levelInput = page.getByRole('textbox', { name: 'Bulk level' })
    await levelInput.fill('25')
    await levelInput.blur()
    await page.getByRole('button', { name: 'Set Level' }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    // Cards should show "LVL 25/70" (non-awakened max is 70)
    const levelLabels = page.getByText('LVL 25/70')
    await expect(levelLabels).toHaveCount(120)

    // Verify via drawer: open first creature, level input should show 25
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')
    await expect(drawer.getByRole('textbox', { name: 'Creature level' })).toHaveValue('25')
  })
})

// ── Edit mode lifecycle ──────────────────────────────────────────────

test.describe('edit mode lifecycle', () => {
  test('clicking Edit My Collection enters edit mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()

    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit My Collection' })).toBeHidden()
  })

  test('Done exits edit mode and persists changes', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByRole('button', { name: 'Edit My Collection' })).toBeVisible()

    // Reload and verify changes persisted
    await page.reload()
    await page.locator('img[alt="Summoned"]').first().waitFor()
    await expect(page.locator('img[alt="Summoned"]')).toHaveCount(120)
  })

  test('Cancel reverts all changes', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('button', { name: 'Edit My Collection' })).toBeVisible()
    await expect(page.locator('img[alt="Not summoned"]')).toHaveCount(120)
  })
})

// ── Bulk actions ─────────────────────────────────────────────────────

test.describe('bulk actions', () => {
  test('bulk summon marks creatures as owned', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.locator('img[alt="Summoned"]')).toHaveCount(120)
  })

  test('bulk unsummon removes ownership', async ({ page }) => {
    // First summon all
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()

    // Then unsummon all
    await page.getByRole('button', { name: 'Not Summoned' }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.locator('img[alt="Not summoned"]')).toHaveCount(120)
  })

  test('bulk awaken sets awakened state', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Awaken', exact: true }).first().click()
    await page.getByRole('button', { name: 'Done' }).click()

    // Click first creature to open drawer and verify awakened
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')
    const awakenedSwitch = drawer.locator('button[role="switch"]').nth(1)
    await expect(awakenedSwitch).toHaveAttribute('aria-checked', 'true')
  })

  test('bulk set level applies level to owned creatures', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()

    // Set level to 50
    const levelInput = page.getByRole('textbox', { name: 'Bulk level' })
    await levelInput.fill('50')
    await levelInput.blur()
    await page.getByRole('button', { name: 'Set Level' }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    // Open drawer and verify level
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')
    const creatureLevel = drawer.getByRole('textbox', { name: 'Creature level' })
    await expect(creatureLevel).toHaveValue('50')
  })

  test('select all and clear update selection count', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit My Collection' }).click()

    await expect(page.getByText('0 of 120 selected')).toBeVisible()

    await page.getByRole('button', { name: 'Select All' }).click()
    await expect(page.getByText('120 of 120 selected')).toBeVisible()

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByText('0 of 120 selected')).toBeVisible()
  })
})

// ── Individual creature editing ──────────────────────────────────────

test.describe('individual creature editing', () => {
  test.beforeEach(async ({ page }) => {
    // Own all creatures first
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
    await page.getByRole('button', { name: 'Select All' }).click()
    await page.getByRole('button', { name: 'Summoned', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    // Re-enter edit mode
    await page.getByRole('button', { name: 'Edit My Collection' }).click()
  })

  test('increase button raises creature level', async ({ page }) => {
    const increaseBtn = page.getByLabel('Increase level').first()
    await increaseBtn.click()
    await increaseBtn.click()

    const levelInput = page.getByLabel('Creature level').first()
    await expect(levelInput).toHaveValue('3')
  })

  test('decrease button lowers creature level', async ({ page }) => {
    // First increase to have room to decrease
    const increaseBtn = page.getByLabel('Increase level').first()
    await increaseBtn.click()
    await increaseBtn.click()

    const decreaseBtn = page.getByLabel('Decrease level').first()
    await decreaseBtn.click()

    const levelInput = page.getByLabel('Creature level').first()
    await expect(levelInput).toHaveValue('2')
  })

  test('level input sets level on blur', async ({ page }) => {
    const levelInput = page.getByLabel('Creature level').first()
    await levelInput.fill('42')
    await levelInput.blur()

    await expect(levelInput).toHaveValue('42')
  })

  test('level slider is present for owned creatures', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Level slider', exact: true }).first()
    await expect(slider).toBeVisible()
    await expect(slider).toHaveAttribute('min', '1')
    await expect(slider).toHaveAttribute('max', '70')
  })

  test('awaken toggle switches creature state', async ({ page }) => {
    // Find the first per-card awaken button (contains ★)
    const awakenBtn = page.locator('button', { hasText: '★' }).first()
    await expect(awakenBtn).toContainText('Awaken')

    await awakenBtn.click()
    await expect(awakenBtn).toContainText('Awakened')
  })
})

// ── Creature drawer ──────────────────────────────────────────────────

test.describe('creature drawer', () => {
  test('clicking a creature opens the drawer', async ({ page }) => {
    await page.locator('.cursor-pointer').first().click()

    const drawer = page.locator('.fixed.inset-y-0.right-0')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('h2')).not.toBeEmpty()
  })

  test('close button dismisses the drawer', async ({ page }) => {
    await page.locator('.cursor-pointer').first().click()

    const drawer = page.locator('.fixed.inset-y-0.right-0')
    await expect(drawer).toBeVisible()

    // Close button is the first button inside the drawer
    await drawer.locator('button').first().click()
    await expect(drawer).toBeHidden()
  })

  test('summoned toggle marks creature as owned', async ({ page }) => {
    await page.locator('.cursor-pointer').first().click()

    const summonedSwitch = page.locator('.fixed.inset-y-0 button[role="switch"]').first()
    await expect(summonedSwitch).toHaveAttribute('aria-checked', 'false')

    await summonedSwitch.click()
    await expect(summonedSwitch).toHaveAttribute('aria-checked', 'true')
  })

  test('level controls appear when owned', async ({ page }) => {
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')

    // Not owned — no level controls
    await expect(drawer.getByLabel('Decrease creature level')).toBeHidden()

    // Toggle summoned
    await drawer.locator('button[role="switch"]').first().click()

    // Level controls appear
    await expect(drawer.getByLabel('Decrease creature level')).toBeVisible()
    await expect(drawer.getByLabel('Increase creature level')).toBeVisible()
  })

  test('drawer level stepper changes level', async ({ page }) => {
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')

    // Own the creature
    await drawer.locator('button[role="switch"]').first().click()

    // Increase level 3 times
    const increaseBtn = drawer.getByLabel('Increase creature level')
    await increaseBtn.click()
    await increaseBtn.click()
    await increaseBtn.click()

    await expect(drawer.getByRole('textbox', { name: 'Creature level' })).toHaveValue('4')
  })

  test('awakened toggle appears when owned and switches state', async ({ page }) => {
    await page.locator('.cursor-pointer').first().click()
    const drawer = page.locator('.fixed.inset-y-0')

    // Own the creature
    await drawer.locator('button[role="switch"]').first().click()

    // Awakened switch should appear (second switch)
    const awakenedSwitch = drawer.locator('button[role="switch"]').nth(1)
    await expect(awakenedSwitch).toBeVisible()
    await expect(awakenedSwitch).toHaveAttribute('aria-checked', 'false')

    await awakenedSwitch.click()
    await expect(awakenedSwitch).toHaveAttribute('aria-checked', 'true')
  })
})

// ── Search & filtering ───────────────────────────────────────────────

/** Count visible creature cards via their status icon (one per card) */
function creatureCards(page: import('@playwright/test').Page) {
  return page.locator('img[alt="Not summoned"], img[alt="Summoned"], img[alt="Awakened"]')
}

test.describe('search and filtering', () => {
  test('search filters creatures by name', async ({ page }) => {
    await page.getByPlaceholder('Search').fill('Moss')
    await expect(creatureCards(page)).toHaveCount(1)
  })

  test('clearing search restores all creatures', async ({ page }) => {
    await page.getByPlaceholder('Search').fill('Moss')
    await expect(creatureCards(page)).toHaveCount(1)

    await page.getByPlaceholder('Search').fill('')
    await expect(creatureCards(page)).toHaveCount(120)
  })

  test('type filter narrows results', async ({ page }) => {
    await page.getByRole('button', { name: 'More filters' }).click()
    await page.getByRole('radio', { name: 'Fire' }).click()

    const count = await creatureCards(page).count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(120)
  })

  test('tier filter shows 20 creatures per tier', async ({ page }) => {
    await page.getByRole('radio', { name: 'T1' }).click()
    await expect(creatureCards(page)).toHaveCount(20)
  })

  test('combined filters narrow results further', async ({ page }) => {
    await page.getByRole('button', { name: 'More filters' }).click()
    await page.getByRole('radio', { name: 'Fire' }).click()
    const fireCount = await creatureCards(page).count()

    await page.getByRole('radio', { name: 'T1' }).click()
    const fireT1Count = await creatureCards(page).count()

    expect(fireT1Count).toBeLessThan(fireCount)
  })

  test('toggling active filter off restores full list', async ({ page }) => {
    await page.getByRole('button', { name: 'More filters' }).click()
    await page.getByRole('radio', { name: 'Fire' }).click()
    const filteredCount = await creatureCards(page).count()
    expect(filteredCount).toBeLessThan(120)

    await page.getByRole('radio', { name: 'Fire' }).click()
    await expect(creatureCards(page)).toHaveCount(120)
  })
})

// ── Table view ───────────────────────────────────────────────────────

test.describe('table view', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('radio', { name: 'Table' }).click()
  })

  test('switching to table view renders rows', async ({ page }) => {
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(120)
  })

  test('clicking Name header sorts ascending', async ({ page }) => {
    await page.getByRole('button', { name: /Name/ }).click()

    const nameTh = page.locator('th', { has: page.getByRole('button', { name: /Name/ }) })
    await expect(nameTh).toHaveAttribute('aria-sort', 'ascending')

    const firstCell = page.locator('tbody tr:first-child td:first-child')
    const secondCell = page.locator('tbody tr:nth-child(2) td:first-child')
    const first = await firstCell.textContent()
    const second = await secondCell.textContent()
    expect(first!.localeCompare(second!)).toBeLessThanOrEqual(0)
  })

  test('clicking same header twice toggles to descending', async ({ page }) => {
    const nameBtn = page.getByRole('button', { name: /Name/ })
    await nameBtn.click()
    await nameBtn.click()

    const nameTh = page.locator('th', { has: page.getByRole('button', { name: /Name/ }) })
    await expect(nameTh).toHaveAttribute('aria-sort', 'descending')
  })

  test('clicking same header three times clears sort', async ({ page }) => {
    const nameBtn = page.getByRole('button', { name: /Name/ })
    await nameBtn.click()
    await nameBtn.click()
    await nameBtn.click()

    const nameTh = page.locator('th', { has: page.getByRole('button', { name: /Name/ }) })
    await expect(nameTh).toHaveAttribute('aria-sort', 'none')
  })

  test('stat columns are visible and sortable', async ({ page }) => {
    // Verify stat column headers exist
    await expect(page.getByRole('button', { name: /POW/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /GRT/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /AGI/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /SMT/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /LOT/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /LCK/ })).toBeVisible()

    // Click POW to sort ascending
    await page.getByRole('button', { name: /POW/ }).click()
    const powTh = page.locator('th', { has: page.getByRole('button', { name: /POW/ }) })
    await expect(powTh).toHaveAttribute('aria-sort', 'ascending')
  })

  test('stat total column is visible and sortable', async ({ page }) => {
    // There are two "Total" buttons (stat total and job total)
    const totalButtons = page.getByRole('button', { name: /^Total/ })
    await expect(totalButtons).toHaveCount(2)

    // Click the first Total (stat total) to sort
    await totalButtons.first().click()
    const totalTh = page.locator('th', { has: totalButtons.first() })
    await expect(totalTh).toHaveAttribute('aria-sort', 'ascending')
  })

  test('tier badge is shown on creature images', async ({ page }) => {
    // Tier badges should be visible in the name column (no separate Tier column)
    const tierBadges = page.locator('tbody td:first-child span', { hasText: /^T\d$/ })
    const count = await tierBadges.count()
    expect(count).toBe(120)
  })

  test('trait column shows abbreviated names', async ({ page }) => {
    // Search for a creature with a long trait to verify abbreviation
    await page.getByPlaceholder('Search').fill('Cinder')
    const traitCell = page.locator('tbody tr .trait-chip')
    const traitText = await traitCell.first().textContent()
    // "heat-resistance" should be abbreviated to "Heat Res"
    expect(traitText!.trim()).toBe('Heat Res')
  })

  test('search filters table rows', async ({ page }) => {
    await page.getByPlaceholder('Search').fill('Moss')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(1)
  })
})
