import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { test, expect, type Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, 'fixtures', 'save.json')

test.beforeEach(async ({ page }) => {
  await page.goto('./configs')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./configs')
  await page.locator('h1', { hasText: 'Game Snapshot' }).waitFor()
})

// ── Helpers ─────────────────────────────────────────────────────────

/** Upload the fixture save. The new ConfigsView auto-applies on drop, so we
 *  just wait for the drop-zone to disappear (it's gated on `!saveConfig`). */
async function uploadSave(page: Page) {
  const fileInput = page.locator('input[type="file"][accept=".json"]')
  await fileInput.setInputFiles(fixturePath)
  await expect(page.getByText('Drop save file here or click to browse')).toBeHidden()
}

// ── Page rendering ──────────────────────────────────────────────────

test.describe('page rendering', () => {
  test('renders header, subtitle, and Reset all button', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Game Snapshot' })).toBeVisible()
    await expect(
      page.getByText("The data the wiki's planners and calculators use for your account", {
        exact: false,
      }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset all' })).toBeVisible()
  })

  test('drop zone is visible until a save is imported', async ({ page }) => {
    await expect(page.getByText('Drop save file here or click to browse')).toBeVisible()
    await expect(page.getByText('No save loaded')).toBeVisible()
  })

  test('Creature Assignments section is visible', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Creature Assignments' })).toBeVisible()
  })

  test('Inventory, Expeditions, and Workstation Queues sections are visible', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Inventory' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Expeditions' }).first()).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Workstation Queues' })).toBeVisible()
  })

  test('Garden and Awaken Tree no longer live on the configs page', async ({ page }) => {
    // Both moved to their own dedicated pages (/garden, /awaken). The configs
    // page should not render them as editable sections anymore.
    await expect(page.locator('h2, h3').filter({ hasText: /^Garden$/ })).toHaveCount(0)
    await expect(page.locator('h2, h3').filter({ hasText: /^Awaken Tree$/ })).toHaveCount(0)
  })
})

// ── Save file import — auto-apply on drop ───────────────────────────

test.describe('save file import', () => {
  test('uploading a save hides the drop zone', async ({ page }) => {
    await uploadSave(page)
    await expect(page.getByText('Drop save file here or click to browse')).toBeHidden()
    await expect(page.getByText('No save loaded')).toBeHidden()
  })

  test('uploading a save shows the imported-at indicator', async ({ page }) => {
    await uploadSave(page)
    // `importedAgo` formats sub-minute timestamps as "just now", longer gaps as
    // "5m ago", etc. — match both.
    await expect(page.getByText(/imported (just now|.+ ago|yesterday)/)).toBeVisible()
  })

  test('uploading a save populates dungeon-party localStorage', async ({ page }) => {
    await uploadSave(page)
    const dungeonParty = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('dungeon-party') ?? '[]'),
    )
    expect(Array.isArray(dungeonParty)).toBe(true)
  })

  test('uploading a save populates sanctuary creatures from the save', async ({ page }) => {
    await uploadSave(page)
    const sanctuary = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('config-sanctuary-creatures') ?? '[]'),
    )
    // The fixture save has 3 sanctuary creatures
    expect(sanctuary.length).toBeGreaterThan(0)
  })

  test('uploading a save populates the garden layout and snapshot', async ({ page }) => {
    await uploadSave(page)
    const layout = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('config-garden-layout') ?? 'null'),
    )
    const snapshot = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('config-garden-layout-from-save') ?? 'null'),
    )
    expect(Array.isArray(layout)).toBe(true)
    expect(Array.isArray(snapshot)).toBe(true)
  })

  test('save data persists across reload', async ({ page }) => {
    await uploadSave(page)
    await page.reload()
    await page.locator('h1', { hasText: 'Game Snapshot' }).waitFor()

    // Drop zone stays hidden because the imported snapshot persists.
    await expect(page.getByText('Drop save file here or click to browse')).toBeHidden()
    await expect(page.getByText(/imported (just now|.+ ago|yesterday)/)).toBeVisible()
  })

  test('applying a save updates the beastiary with summoned creatures', async ({ page }) => {
    await uploadSave(page)
    await page.goto('./')
    await page.locator('img[alt="Not Summoned"]').first().waitFor()

    // Fixture: 5 owned creatures — 4 summoned + 1 awakened
    await expect(page.locator('img[alt="Summoned"]')).toHaveCount(4)
    await expect(page.locator('img[alt="Awakened"]')).toHaveCount(1)
  })

  test('applying a save excludes assigned creatures from the expedition list', async ({ page }) => {
    await uploadSave(page)
    await page.goto('./expeditions')
    await page.getByText('Expedition Training').first().click()
    await expect(page.locator('h3', { hasText: 'Expedition Training' })).toBeVisible()

    await page.getByText('Summoned Only').click()

    const creatureCards = page.locator('button', { has: page.locator('img[alt$="artwork"]') })
    const countWithoutExcluded = await creatureCards.count()

    await page.getByText('Show Excluded').click()
    const countWithExcluded = await creatureCards.count()

    expect(countWithExcluded).toBeGreaterThan(countWithoutExcluded)
  })
})

// ── Reset all ───────────────────────────────────────────────────────

test.describe('reset all', () => {
  test('Reset all wipes seeded state and brings back the drop zone', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('config-sanctuary-creatures', JSON.stringify(['moss', 'scoots']))
      localStorage.setItem(
        'expedition-parties',
        JSON.stringify({ 'expedition-type-1': ['moss', 'scoots'] }),
      )
      localStorage.setItem('expedition-tiers', JSON.stringify({ 'expedition-type-1': 2 }))
    })
    await page.goto('./configs')
    await page.locator('h1', { hasText: 'Game Snapshot' }).waitFor()

    await page.getByRole('button', { name: 'Reset all' }).click()

    // Drop zone reappears once the save snapshot is cleared.
    await expect(page.getByText('Drop save file here or click to browse')).toBeVisible()

    const expeditionKeys = await page.evaluate(() => ({
      parties: JSON.parse(localStorage.getItem('expedition-parties') ?? '{}'),
      tiers: JSON.parse(localStorage.getItem('expedition-tiers') ?? '{}'),
    }))
    expect(expeditionKeys.parties).toEqual({})
    expect(expeditionKeys.tiers).toEqual({})
  })

  test('Reset all after importing a save clears the imported indicator', async ({ page }) => {
    await uploadSave(page)
    await expect(page.getByText(/imported (just now|.+ ago|yesterday)/)).toBeVisible()

    await page.getByRole('button', { name: 'Reset all' }).click()

    await expect(page.getByText('No save loaded')).toBeVisible()
    await expect(page.getByText('Drop save file here or click to browse')).toBeVisible()
  })
})

// ── Expeditions ladder ─────────────────────────────────────────────

test.describe('expeditions ladder', () => {
  test('renders aggregate unlock and tier badges', async ({ page }) => {
    // The ladder shows aggregate counts ("X/Y unlocked", "X/Y tiers") even
    // without any seeded completion data — both default to "0/N".
    await expect(page.getByText(/\d+\/\d+ unlocked/)).toBeVisible()
    await expect(page.getByText(/\d+\/\d+ tiers/)).toBeVisible()
  })

  test('completion data updates the unlocked-count badge', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'config-expedition-completions',
        JSON.stringify({
          'expedition-type-1': { 1: 20, 2: 15, 3: 10 },
          'expedition-type-2': { 1: 5 },
        }),
      )
    })
    await page.reload()
    await page.locator('h1', { hasText: 'Game Snapshot' }).waitFor()

    // At least one expedition should now read as unlocked.
    const unlockedBadge = page.getByText(/\d+\/\d+ unlocked/)
    await expect(unlockedBadge).toBeVisible()
    const badgeText = await unlockedBadge.textContent()
    expect(badgeText).toMatch(/^[1-9]\d*\/\d+ unlocked/)
  })
})
