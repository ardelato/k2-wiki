import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.goto('./expeditions')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./expeditions')
  await page.waitForLoadState('networkidle')
})

/** Creature cards — buttons that contain a creature artwork image */
function creatureCards(page: Page) {
  return page.locator('button', { has: page.locator('img[alt$="artwork"]') })
}

/** Filled party slots — size-20 divs with creature artwork */
function filledPartySlots(page: Page) {
  return page.locator('.size-20', { has: page.locator('img[alt$="artwork"]') })
}

async function selectFirstExpedition(page: Page) {
  await page.getByText('Expedition Training').first().click()
  await expect(page.locator('h3', { hasText: 'Expedition Training' })).toBeVisible()
}

async function showAllCreatures(page: Page) {
  await page.getByText('Summoned Only').click()
}

async function assignFirstCreature(page: Page) {
  // Click the first empty slot to activate it
  await page.locator('.border-dashed').first().click()
  await expect(page.getByText('Select', { exact: true })).toBeVisible()
  // Click the first creature card (has artwork image)
  await creatureCards(page).first().click()
  // Wait for the slot to fill
  await expect(filledPartySlots(page).first()).toBeVisible()
}

// ── Expedition selection ─────────────────────────────────────────────

test.describe('expedition selection', () => {
  test('default page renders expedition list', async ({ page }) => {
    await expect(page.getByText('Expedition Training').first()).toBeVisible()
  })

  test('clicking expedition shows details in center panel', async ({ page }) => {
    await selectFirstExpedition(page)
    await expect(page.locator('h3', { hasText: 'Expedition Training' })).toBeVisible()
  })

  test('query param pre-selects expedition', async ({ page }) => {
    await page.goto('./expeditions?expedition=expedition-type-1')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h3', { hasText: 'Expedition Training' })).toBeVisible()
  })
})

// ── Tier & loop configuration ────────────────────────────────────────

test.describe('tier and loop configuration', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstExpedition(page)
  })

  test('clicking tier button changes difficulty rating', async ({ page }) => {
    // Rating is inside the "Advanced Details" collapsible section
    await page.getByRole('button', { name: 'Advanced Details' }).click()
    const difficultyValue = page.locator('p.font-mono.font-semibold').first()
    const initialDifficulty = parseInt((await difficultyValue.textContent())!)

    await page.getByAltText('Tier 3').click()

    const newDifficulty = parseInt((await difficultyValue.textContent())!)
    expect(newDifficulty).toBeGreaterThan(initialDifficulty)
  })

  test('loop count stepper adjusts loop count', async ({ page }) => {
    const loopInput = page.getByRole('textbox', { name: 'Loop count' })
    await expect(loopInput).toHaveValue('0')

    await page.getByLabel('Increase loop count by 10').click()
    await expect(loopInput).toHaveValue('10')

    await page.getByLabel('Increase loop count by 10').click()
    await expect(loopInput).toHaveValue('20')

    await page.getByLabel('Decrease loop count by 10').click()
    await expect(loopInput).toHaveValue('10')
  })

  test('loop bonus badge shows after 10 loops', async ({ page }) => {
    // Before loops, no bonus percentage badge (only the static help text exists)
    await expect(page.getByText('+1%', { exact: true })).toBeHidden()

    await page.getByLabel('Increase loop count by 10').click()
    await expect(page.getByText('+1%', { exact: true })).toBeVisible()

    await page.getByLabel('Increase loop count by 10').click()
    await expect(page.getByText('+2%', { exact: true })).toBeVisible()
  })
})

// ── Party building ───────────────────────────────────────────────────

test.describe('party building', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstExpedition(page)
    await showAllCreatures(page)
  })

  test('clicking empty slot activates it', async ({ page }) => {
    await page.locator('.border-dashed').first().click()
    await expect(page.getByText('Select', { exact: true })).toBeVisible()
  })

  test('clicking creature assigns it to party slot', async ({ page }) => {
    await assignFirstCreature(page)
    await expect(filledPartySlots(page)).toHaveCount(1)
  })

  test('remove button clears creature from slot', async ({ page }) => {
    await assignFirstCreature(page)

    // Click X button on the filled slot
    await filledPartySlots(page).first().locator('button').click()
    await expect(filledPartySlots(page)).toHaveCount(0)
  })
})

// ── XP rate validation ───────────────────────────────────────────────

test.describe('XP rate validation', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstExpedition(page)
    await showAllCreatures(page)
  })

  test('assigning creature shows XP/s rate on expedition card', async ({ page }) => {
    await assignFirstCreature(page)
    await expect(page.getByText(/\d+\.\d+ XP\/s/).first()).toBeVisible()
  })

  test('assigning creature shows per-creature XP rate', async ({ page }) => {
    await assignFirstCreature(page)
    await expect(page.getByText(/\(\d+\.\d+\/ea\)/).first()).toBeVisible()
  })

  test('XP rates are non-zero', async ({ page }) => {
    await assignFirstCreature(page)

    const xpText = await page
      .getByText(/\d+\.\d+ XP\/s/)
      .first()
      .textContent()
    const xpValue = parseFloat(xpText!.match(/(\d+\.\d+)/)![1])
    expect(xpValue).toBeGreaterThan(0)

    const eaText = await page
      .getByText(/\(\d+\.\d+\/ea\)/)
      .first()
      .textContent()
    const eaValue = parseFloat(eaText!.match(/(\d+\.\d+)/)![1])
    expect(eaValue).toBeGreaterThan(0)
  })

  test('level 120 creature produces 0.00 party XP/s but non-zero per-creature rate', async ({
    page,
  }) => {
    // Assign a creature first and verify non-zero rates
    await assignFirstCreature(page)
    const initialXpText = await page
      .getByText(/\d+\.\d+ XP\/s/)
      .first()
      .textContent()
    const initialXpRate = parseFloat(initialXpText!.match(/(\d+\.\d+)/)![1])
    expect(initialXpRate).toBeGreaterThan(0)

    // Set all creature levels to 120 via localStorage, then reload
    // This simulates having max-level creatures in the party
    await page.evaluate(() => {
      const parties = JSON.parse(localStorage.getItem('expedition-parties') || '{}')
      const levels = JSON.parse(localStorage.getItem('expedition-creature-levels') || '{}')
      for (const ids of Object.values(parties) as string[][]) {
        for (const id of ids) {
          levels[id] = 120
        }
      }
      localStorage.setItem('expedition-creature-levels', JSON.stringify(levels))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Party XP/s should be 0.00 (all creatures at max level earn no XP)
    await expect(page.getByText('0.00 XP/s')).toBeVisible()

    // Per-creature rate should still be non-zero (XP is calculated, just not earned)
    const eaText = await page
      .getByText(/\(\d+\.\d+\/ea\)/)
      .first()
      .textContent()
    const eaRate = parseFloat(eaText!.match(/(\d+\.\d+)/)![1])
    expect(eaRate).toBeGreaterThan(0)
  })

  test('total XP/s badge appears when party assigned', async ({ page }) => {
    await assignFirstCreature(page)

    // The header shows "N.NN XP/s" — find it near the "Expeditions" heading
    const header = page.locator('h2', { hasText: 'Expeditions' }).locator('..')
    const totalBadge = header.getByText(/\d+\.\d+ XP\/s/)
    await expect(totalBadge).toBeVisible()
    const text = await totalBadge.textContent()
    const value = parseFloat(text!.match(/(\d+\.\d+)/)![1])
    expect(value).toBeGreaterThan(0)
  })
})

// ── Suggested level validation ───────────────────────────────────────

test.describe('suggested level validation', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstExpedition(page)
    await showAllCreatures(page)
  })

  test('creatures show suggested level', async ({ page }) => {
    await expect(page.getByText(/Suggested: \d+/).first()).toBeVisible()
  })

  test('suggested level is a valid number between 1-120', async ({ page }) => {
    const text = await page
      .getByText(/Suggested: \d+/)
      .first()
      .textContent()
    const level = parseInt(text!.match(/Suggested: (\d+)/)![1])
    expect(level).toBeGreaterThanOrEqual(1)
    expect(level).toBeLessThanOrEqual(120)
  })

  test('suggested level has color indicator', async ({ page }) => {
    const suggestedSpan = page
      .locator(
        '[class*="text-emerald-700"], [class*="text-amber-700"], [class*="text-emerald-400"], [class*="text-amber-400"]',
      )
      .filter({ hasText: /Suggested/ })
    await expect(suggestedSpan.first()).toBeVisible()
  })
})

// ── Creature filtering ───────────────────────────────────────────────

test.describe('creature filtering', () => {
  test.beforeEach(async ({ page }) => {
    await selectFirstExpedition(page)
    await showAllCreatures(page)
  })

  test('search filters creatures by name', async ({ page }) => {
    const countBefore = await creatureCards(page).count()

    await page.getByPlaceholder('Search creature').fill('Moss')
    const countAfter = await creatureCards(page).count()

    expect(countAfter).toBeLessThan(countBefore)
    expect(countAfter).toBeGreaterThan(0)
  })

  test('Show Excluded toggle reveals excluded creatures', async ({ page }) => {
    // Seed some creatures as excluded (in sanctuary)
    await page.evaluate(() => {
      localStorage.setItem('config-sanctuary-creatures', JSON.stringify(['moss', 'scoots']))
      // Ensure creatures are owned so they'd normally appear
      const coll = JSON.parse(localStorage.getItem('creature-collection') || '{}')
      coll.moss = { owned: true, level: 10, awakened: false }
      coll.scoots = { owned: true, level: 10, awakened: false }
      localStorage.setItem('creature-collection', JSON.stringify(coll))
    })
    await page.goto('./expeditions')
    await page.waitForLoadState('networkidle')
    await selectFirstExpedition(page)
    await showAllCreatures(page)

    const countWithout = await creatureCards(page).count()

    // Click "Show Excluded" to include excluded creatures
    await page.getByText('Show Excluded').click()
    const countWith = await creatureCards(page).count()

    expect(countWith).toBeGreaterThan(countWithout)
  })

  test('element type toggle narrows creature list', async ({ page }) => {
    const countBefore = await creatureCards(page).count()

    // Expand "More filters" to access element type buttons
    await page.getByRole('button', { name: 'More filters' }).click()

    // The Fire toggle button doesn't contain an artwork image, so it won't match creatureCards
    // Find it specifically as a small toggle button with exact text
    const fireToggle = page.getByRole('button', { name: 'Fire', exact: true }).last()
    await fireToggle.click()
    const countAfter = await creatureCards(page).count()

    expect(countAfter).toBeLessThan(countBefore)
    expect(countAfter).toBeGreaterThan(0)
  })
})

// ── Reset ────────────────────────────────────────────────────────────

test.describe('reset', () => {
  test('reset all clears party assignments', async ({ page }) => {
    await selectFirstExpedition(page)
    await showAllCreatures(page)
    await assignFirstCreature(page)

    await expect(filledPartySlots(page)).toHaveCount(1)

    // Accept the confirmation dialog
    page.on('dialog', (dialog) => dialog.accept())

    // Click Reset All button (has title="Reset All")
    await page.locator('button[title="Reset All"]').click()

    await expect(filledPartySlots(page)).toHaveCount(0)
  })
})
