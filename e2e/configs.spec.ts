import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { test, expect, type Page, type Locator } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.beforeEach(async ({ page }) => {
  await page.goto('./configs')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./configs')
  await page.locator('h1', { hasText: 'Configs' }).waitFor()
})

// ── Helpers ─────────────────────────────────────────────────────────

/** Seed creature-collection so the exclusion picker has owned creatures */
async function seedOwnedCreatures(page: Page) {
  const creatures: Record<string, { owned: boolean; level: number; awakened: boolean }> = {}
  for (const id of ['moss', 'scoots', 'slick', 'chroma', 'sunny']) {
    creatures[id] = { owned: true, level: 10, awakened: false }
  }
  await page.evaluate(
    (data) => localStorage.setItem('creature-collection', JSON.stringify(data)),
    creatures,
  )
  await page.goto('./configs')
  await page.locator('h1', { hasText: 'Configs' }).waitFor()
}

/**
 * Locate a config subsection by its heading text.
 * Each subsection is a div.rounded-xl or section containing the heading.
 * We find the heading then walk up to the nearest rounded-xl container.
 */
function configSection(page: Page, headingText: string): Locator {
  return page
    .locator('section.rounded-xl, div.rounded-xl')
    .filter({ has: page.locator('h2, h3').filter({ hasText: headingText }) })
    .first()
}

/** Assign a creature to the first empty sanctuary slot via the picker */
async function assignSanctuaryCreature(page: Page, creatureName: string) {
  const sec = configSection(page, 'Creature Exclusions')
  const emptySlot = sec.locator('.size-16.border-dashed').first()
  await emptySlot.click()
  await expect(sec.getByText('Select', { exact: true })).toBeVisible()

  // Open the creature picker dropdown (Teleported to body)
  await page.getByText('Choose a creature').click()
  await page.getByPlaceholder('Search creatures...').fill(creatureName)
  await page.getByRole('button', { name: creatureName }).first().click()
}

// ── Page rendering ──────────────────────────────────────────────────

test.describe('page rendering', () => {
  test('renders header and Reset All button', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Configs' })).toBeVisible()
    await expect(page.getByText('Manage creature exclusions')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset All' })).toBeVisible()
  })

  test('all config sections are visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Save File Import' })).toBeVisible()
    await expect(page.locator('h2', { hasText: 'Creature Exclusions' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Inventory' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Garden' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Awaken Tree' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Job Tiers' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Expeditions' })).toBeVisible()
  })

  test('Creature Collection section is hidden without save file', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Creature Collection' })).toBeHidden()
  })
})

// ── Creature exclusions — edit lifecycle ─────────────────────────────

test.describe('creature exclusions - edit lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await seedOwnedCreatures(page)
  })

  test('clicking Edit shows Done and Cancel buttons', async ({ page }) => {
    const sec = configSection(page, 'Creature Exclusions')
    await sec.getByRole('button', { name: 'Edit' }).click()

    await expect(sec.getByRole('button', { name: 'Done' })).toBeVisible()
    await expect(sec.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(sec.getByRole('button', { name: 'Edit' })).toBeHidden()
  })

  test('Cancel exits edit mode without changes', async ({ page }) => {
    const sec = configSection(page, 'Creature Exclusions')
    await sec.getByRole('button', { name: 'Edit' }).click()
    await sec.getByRole('button', { name: 'Cancel' }).click()

    await expect(sec.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(sec.getByText('0 excluded')).toBeVisible()
  })

  test('Done persists creature assignment across reload', async ({ page }) => {
    const sec = configSection(page, 'Creature Exclusions')
    await sec.getByRole('button', { name: 'Edit' }).click()
    await assignSanctuaryCreature(page, 'Moss')
    await sec.getByRole('button', { name: 'Done' }).click()

    await page.reload()
    await page.locator('h1', { hasText: 'Configs' }).waitFor()
    await expect(page.getByText('1 excluded')).toBeVisible()
  })

  test('Cancel reverts creature assignment', async ({ page }) => {
    const sec = configSection(page, 'Creature Exclusions')
    await sec.getByRole('button', { name: 'Edit' }).click()
    await assignSanctuaryCreature(page, 'Moss')

    await expect(sec.locator('img[alt="Moss"]').first()).toBeVisible()

    await sec.getByRole('button', { name: 'Cancel' }).click()
    await expect(sec.getByText('0 excluded')).toBeVisible()
  })
})

// ── Creature exclusions — slot interaction ───────────────────────────

test.describe('creature exclusions - slot interaction', () => {
  test.beforeEach(async ({ page }) => {
    await seedOwnedCreatures(page)
    await configSection(page, 'Creature Exclusions').getByRole('button', { name: 'Edit' }).click()
  })

  test('clicking empty slot shows Select text and creature picker', async ({ page }) => {
    const sec = configSection(page, 'Creature Exclusions')
    await sec.locator('.size-16.border-dashed').first().click()

    await expect(sec.getByText('Select', { exact: true })).toBeVisible()
    await expect(page.getByText('Choose a creature')).toBeVisible()
  })

  test('picking a creature fills the slot', async ({ page }) => {
    await assignSanctuaryCreature(page, 'Moss')

    const sec = configSection(page, 'Creature Exclusions')
    await expect(sec.locator('img[alt="Moss"]').first()).toBeVisible()
  })

  test('remove button clears a filled slot', async ({ page }) => {
    await assignSanctuaryCreature(page, 'Moss')

    const sec = configSection(page, 'Creature Exclusions')
    const filledSlot = sec.locator('.size-16').filter({ has: page.locator('img[alt="Moss"]') })
    await filledSlot.locator('button').click()

    await expect(sec.locator('img[alt="Moss"]')).toBeHidden()
  })

  test('excluded count badge updates', async ({ page }) => {
    await expect(page.getByText('0 excluded')).toBeVisible()

    await assignSanctuaryCreature(page, 'Moss')
    await expect(page.getByText('1 excluded')).toBeVisible()
  })
})

// ── Garden editing ──────────────────────────────────────────────────

test.describe('garden editing', () => {
  test('default shows no flowers configured', async ({ page }) => {
    await expect(page.getByText('No garden flowers configured.')).toBeVisible()
  })

  test('Edit shows flower types with +/- controls', async ({ page }) => {
    const sec = configSection(page, 'Garden')
    await sec.getByRole('button', { name: 'Edit' }).click()

    await expect(sec.getByText('Fire Flower')).toBeVisible()
    await expect(sec.getByText('Wind Flower')).toBeVisible()
    await expect(sec.getByText('Earth Flower')).toBeVisible()
    await expect(sec.getByText('Water Flower')).toBeVisible()
    await expect(sec.getByText('0 / 25 flowers placed')).toBeVisible()
    await expect(sec.getByText('25 slots left')).toBeVisible()
  })

  test('incrementing flower count updates totals', async ({ page }) => {
    const sec = configSection(page, 'Garden')
    await sec.getByRole('button', { name: 'Edit' }).click()

    // Find Fire Flower container, then its Lv1 column's + button
    const fireContainer = sec.locator('div.rounded-xl').filter({ hasText: 'Fire Flower' }).first()
    const lv1Col = fireContainer.locator('.grid-cols-6 > div').first()
    await lv1Col.getByRole('button', { name: '+' }).click()
    await lv1Col.getByRole('button', { name: '+' }).click()
    await lv1Col.getByRole('button', { name: '+' }).click()

    await expect(sec.getByText('3 / 25 flowers placed')).toBeVisible()
    await expect(sec.getByText('22 slots left')).toBeVisible()
  })

  test('Done persists garden changes', async ({ page }) => {
    const sec = configSection(page, 'Garden')
    await sec.getByRole('button', { name: 'Edit' }).click()

    const fireContainer = sec.locator('div.rounded-xl').filter({ hasText: 'Fire Flower' }).first()
    const lv1Col = fireContainer.locator('.grid-cols-6 > div').first()
    await lv1Col.getByRole('button', { name: '+' }).click()
    await lv1Col.getByRole('button', { name: '+' }).click()

    await sec.getByRole('button', { name: 'Done' }).click()

    await page.reload()
    await page.locator('h1', { hasText: 'Configs' }).waitFor()

    // Read-only view shows level badge "2×" and "Lv1"
    const gardenSec = configSection(page, 'Garden')
    await expect(gardenSec.getByText('2×')).toBeVisible()
    await expect(gardenSec.getByText('Lv1')).toBeVisible()
  })

  test('Cancel reverts garden changes', async ({ page }) => {
    const sec = configSection(page, 'Garden')
    await sec.getByRole('button', { name: 'Edit' }).click()

    const fireContainer = sec.locator('div.rounded-xl').filter({ hasText: 'Fire Flower' }).first()
    const lv1Col = fireContainer.locator('.grid-cols-6 > div').first()
    await lv1Col.getByRole('button', { name: '+' }).click()

    await sec.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('No garden flowers configured.')).toBeVisible()
  })
})

// ── Awaken tree editing ─────────────────────────────────────────────

test.describe('awaken tree editing', () => {
  test('default read-only shows zero values', async ({ page }) => {
    await expect(page.getByText('Yield +0, Duration -0%').first()).toBeVisible()
    await expect(page.getByText('Speed +0%').first()).toBeVisible()
  })

  test('Edit shows +/- steppers for yield, duration, and speed', async ({ page }) => {
    const sec = configSection(page, 'Awaken Tree')
    await sec.getByRole('button', { name: 'Edit' }).click()

    await expect(sec.getByText('Yield').first()).toBeVisible()
    await expect(sec.getByText('Duration').first()).toBeVisible()
    await expect(sec.getByText('Speed').first()).toBeVisible()
  })

  test('incrementing yield and duration updates display', async ({ page }) => {
    const sec = configSection(page, 'Awaken Tree')
    await sec.getByRole('button', { name: 'Edit' }).click()

    // Chopping row: find the row containing "Chopping" text
    const choppingRow = sec
      .locator('div.flex.items-center.justify-between')
      .filter({ hasText: 'Chopping' })
      .first()

    // Yield + button: the row has Yield label followed by - and + buttons
    const yieldControls = choppingRow
      .locator('div.flex.items-center.gap-1')
      .filter({ hasText: 'Yield' })
      .first()
    await yieldControls.locator('button').last().click()
    await expect(yieldControls.getByText('+1')).toBeVisible()

    // Duration + button
    const durationControls = choppingRow
      .locator('div.flex.items-center.gap-1')
      .filter({ hasText: 'Duration' })
      .first()
    await durationControls.locator('button').last().click()
    await expect(durationControls.getByText('-5%')).toBeVisible()
  })

  test('incrementing speed updates workstation display', async ({ page }) => {
    const sec = configSection(page, 'Awaken Tree')
    await sec.getByRole('button', { name: 'Edit' }).click()

    const furnaceRow = sec
      .locator('div.flex.items-center.justify-between')
      .filter({ hasText: 'Furnace' })
      .first()
    const speedControls = furnaceRow
      .locator('div.flex.items-center.gap-1')
      .filter({ hasText: 'Speed' })
      .first()
    await speedControls.locator('button').last().click()
    await expect(speedControls.getByText('+10%')).toBeVisible()
  })

  test('Done persists and Cancel reverts awaken changes', async ({ page }) => {
    const sec = configSection(page, 'Awaken Tree')
    await sec.getByRole('button', { name: 'Edit' }).click()

    const choppingRow = sec
      .locator('div.flex.items-center.justify-between')
      .filter({ hasText: 'Chopping' })
      .first()
    const yieldControls = choppingRow
      .locator('div.flex.items-center.gap-1')
      .filter({ hasText: 'Yield' })
      .first()
    await yieldControls.locator('button').last().click()

    await sec.getByRole('button', { name: 'Done' }).click()

    await page.reload()
    await page.locator('h1', { hasText: 'Configs' }).waitFor()
    await expect(page.getByText('Yield +1, Duration -0%').first()).toBeVisible()

    // Edit again, change, and cancel
    const sec2 = configSection(page, 'Awaken Tree')
    await sec2.getByRole('button', { name: 'Edit' }).click()
    const choppingRow2 = sec2
      .locator('div.flex.items-center.justify-between')
      .filter({ hasText: 'Chopping' })
      .first()
    const yieldControls2 = choppingRow2
      .locator('div.flex.items-center.gap-1')
      .filter({ hasText: 'Yield' })
      .first()
    await yieldControls2.locator('button').last().click()

    await sec2.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Yield +1, Duration -0%').first()).toBeVisible()
  })
})

// ── Section collapse/expand ─────────────────────────────────────────

test.describe('section collapse/expand', () => {
  test('clicking section header toggles content visibility', async ({ page }) => {
    await expect(page.getByText('No garden flowers configured.')).toBeVisible()

    // Collapse — click the heading button
    await page.locator('h3', { hasText: 'Garden' }).click()
    await expect(page.getByText('No garden flowers configured.')).toBeHidden()

    // Expand
    await page.locator('h3', { hasText: 'Garden' }).click()
    await expect(page.getByText('No garden flowers configured.')).toBeVisible()
  })
})

// ── Reset All ───────────────────────────────────────────────────────

test.describe('reset all', () => {
  test('Reset All clears all configured data', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('config-sanctuary-creatures', JSON.stringify(['moss', 'scoots']))
      localStorage.setItem(
        'config-garden-flowers',
        JSON.stringify({
          'fire-flower': [{ level: 1, count: 5 }],
          'wind-flower': [],
          'earth-flower': [],
          'water-flower': [],
        }),
      )
      localStorage.setItem(
        'config-awaken-gather',
        JSON.stringify({
          Chopping: { yieldBonus: 1, durationTier: 2 },
          Mining: { yieldBonus: 0, durationTier: 0 },
          Digging: { yieldBonus: 0, durationTier: 0 },
          Exploring: { yieldBonus: 0, durationTier: 0 },
          Fishing: { yieldBonus: 0, durationTier: 0 },
          Farming: { yieldBonus: 0, durationTier: 0 },
        }),
      )
    })
    await page.goto('./configs')
    await page.locator('h1', { hasText: 'Configs' }).waitFor()

    await expect(page.getByText('2 excluded')).toBeVisible()

    await page.getByRole('button', { name: 'Reset All' }).click()

    await expect(page.getByText('0 excluded')).toBeVisible()
    await expect(page.getByText('No garden flowers configured.')).toBeVisible()
    await expect(page.getByText('Yield +0, Duration -0%').first()).toBeVisible()
  })
})

// ── Save file import ────────────────────────────────────────────────

test.describe('save file import', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'save.json')

  async function uploadSave(page: Page) {
    const fileInput = page.locator('input[type="file"][accept=".json"]')
    await fileInput.setInputFiles(fixturePath)
    await page.getByRole('button', { name: 'Apply All From Save' }).waitFor()
  }

  test('uploading save file shows Apply All button with counts', async ({ page }) => {
    await uploadSave(page)

    await expect(page.getByRole('button', { name: 'Apply All From Save' })).toBeVisible()
    // The count text is "N creatures, N items" in a single span
    await expect(page.getByText(/\d+ creatures, \d+ items/)).toBeVisible()
  })

  test('uploading save file reveals Creature Collection section', async ({ page }) => {
    await uploadSave(page)

    await expect(page.locator('h2', { hasText: 'Creature Collection' })).toBeVisible()
  })

  test('creature collection shows new creatures from save', async ({ page }) => {
    await uploadSave(page)

    // All creatures are new since localStorage was cleared
    await expect(page.getByText(/\+\d+ new/)).toBeVisible()
  })

  test('per-section Apply buttons appear for sections with diffs', async ({ page }) => {
    await uploadSave(page)

    // Exclusions should show "Apply from Save"
    const exclusionSec = configSection(page, 'Creature Exclusions')
    await expect(exclusionSec.getByRole('button', { name: 'Apply from Save' })).toBeVisible()
  })

  test('Apply All imports all data and shows Applied badges', async ({ page }) => {
    await uploadSave(page)

    await page.getByRole('button', { name: 'Apply All From Save' }).click()

    // Creature Collection should show "Applied"
    await expect(page.getByText('Applied').first()).toBeVisible()

    // Exclusions should now have creatures (sanctuary 3 + helpers 1 + machines 1 = 5)
    await expect(page.getByText('5 excluded')).toBeVisible()
  })

  test('applying creatures persists across reload', async ({ page }) => {
    await uploadSave(page)
    await page.getByRole('button', { name: 'Apply All From Save' }).click()

    await page.reload()
    await page.locator('h1', { hasText: 'Configs' }).waitFor()

    // Exclusions should persist
    await expect(page.getByText('5 excluded')).toBeVisible()

    // Awaken values should persist (chopping: yield +2, duration -5%)
    await expect(page.getByText('Yield +2, Duration -5%').first()).toBeVisible()
  })

  test('applying save updates beastiary with summoned creatures and levels', async ({ page }) => {
    await uploadSave(page)
    await page.getByRole('button', { name: 'Apply All From Save' }).click()

    // Navigate to beastiary (root route)
    await page.goto('./')
    await page.locator('img[alt="Not summoned"]').first().waitFor()

    // Save has 5 creatures — 4 summoned + 1 awakened (Moss)
    await expect(page.locator('img[alt="Summoned"]')).toHaveCount(4)
    await expect(page.locator('img[alt="Awakened"]')).toHaveCount(1)
    // Remaining 115 should be not summoned
    await expect(page.locator('img[alt="Not summoned"]')).toHaveCount(115)
  })

  test('applying save excludes creatures from expedition list', async ({ page }) => {
    await uploadSave(page)
    await page.getByRole('button', { name: 'Apply All From Save' }).click()

    // Navigate to expeditions
    await page.goto('./expeditions')
    await page.getByText('Expedition Training').first().waitFor()

    // Select first expedition to show creature panel
    await page.getByText('Expedition Training').first().click()
    await expect(page.locator('h3', { hasText: 'Expedition Training' })).toBeVisible()

    // Toggle to show all creatures (not just summoned)
    await page.getByText('Summoned Only').click()

    // The save has 5 creatures excluded (3 sanctuary + 1 helper + 1 machine)
    // Count creature cards (buttons with artwork images)
    const creatureCards = page.locator('button', { has: page.locator('img[alt$="artwork"]') })
    const countWithoutExcluded = await creatureCards.count()

    // Toggle "Show Excluded" to include them
    await page.getByText('Show Excluded').click()
    const countWithExcluded = await creatureCards.count()

    // With excluded shown, there should be more creatures
    expect(countWithExcluded).toBeGreaterThan(countWithoutExcluded)
  })

  test('individual section Apply imports only that section', async ({ page }) => {
    await uploadSave(page)

    // Apply only Creature Collection (not Apply All)
    const creatureSec = configSection(page, 'Creature Collection')
    await creatureSec.getByRole('button', { name: 'Apply' }).click()

    // Creature Collection should show "Applied"
    await expect(creatureSec.getByText('Applied')).toBeVisible()

    // Exclusions should still show "Apply from Save" (not applied yet)
    const exclusionSec = configSection(page, 'Creature Exclusions')
    await expect(exclusionSec.getByRole('button', { name: 'Apply from Save' })).toBeVisible()
  })

  test('applying inventory section shows Applied badge', async ({ page }) => {
    await uploadSave(page)

    // Expand inventory if collapsed
    const inventorySec = configSection(page, 'Inventory')
    await inventorySec.getByRole('button', { name: 'Apply' }).click()

    await expect(inventorySec.getByText('Applied')).toBeVisible()
  })

  test('section shows Matches Save when data already matches', async ({ page }) => {
    // Apply save first
    await uploadSave(page)
    await page.getByRole('button', { name: 'Apply All From Save' }).click()

    // Reload to clear in-memory appliedSections state, then re-upload
    await page.reload()
    await page.locator('h1', { hasText: 'Configs' }).waitFor()
    await uploadSave(page)

    // Exclusions should show "Matches Save" since data now matches
    const exclusionSec = configSection(page, 'Creature Exclusions')
    await expect(exclusionSec.getByText('Matches Save')).toBeVisible()
  })
})
