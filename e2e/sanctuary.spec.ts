import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./sanctuary')
  await page.waitForLoadState('networkidle')
})

test.describe('sanctuary page', () => {
  test('renders page title and description', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sanctuary', level: 1 })).toBeVisible()
    await expect(
      page.getByText('Place awakened creatures to boost gathering skill tiers.'),
    ).toBeVisible()
  })

  test('renders party slots section with 8 slots', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Party 0\/8/ })).toBeVisible()
  })

  test('renders skill benefits for all 6 jobs', async ({ page }) => {
    await expect(page.getByText('Skill Benefits')).toBeVisible()
    for (const job of ['Chopping', 'Mining', 'Digging', 'Exploring', 'Fishing', 'Farming']) {
      await expect(page.getByText(job).first()).toBeVisible()
    }
  })

  test('renders creature browser with search and filters', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Select Creature' })).toBeVisible()
    await expect(page.getByPlaceholder('Search creature')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Summoned Only' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show Excluded' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'More filters' })).toBeVisible()
  })

  test('creature count is displayed', async ({ page }) => {
    await expect(page.getByText(/\d+ creatures/)).toBeVisible()
  })

  test('clicking a target tier button selects it', async ({ page }) => {
    const yieldButton = page.getByRole('button', { name: '+1 Yield' }).first()
    await yieldButton.click()
    await expect(yieldButton).toHaveClass(/bg-primary/)
  })

  test('clicking a selected target tier button deselects it', async ({ page }) => {
    const yieldButton = page.getByRole('button', { name: '+1 Yield' }).first()
    await yieldButton.click()
    await expect(yieldButton).toHaveClass(/bg-primary/)

    await yieldButton.click()
    await expect(yieldButton).not.toHaveClass(/bg-primary/)
  })

  test('more filters expands type and tier options', async ({ page }) => {
    await page.getByRole('button', { name: 'More filters' }).click()
    await expect(page.getByText('Type')).toBeVisible()
    for (const type of ['Fire', 'Water', 'Wind', 'Earth']) {
      await expect(page.getByRole('button', { name: type })).toBeVisible()
    }
  })

  test('search filters creature list', async ({ page }) => {
    // Disable "Summoned Only" to ensure creatures are shown
    await page.getByRole('button', { name: 'Summoned Only' }).click()
    const countBefore = await page.getByText(/\d+ creatures/).textContent()
    await page.getByPlaceholder('Search creature').fill('zzzznonexistent')
    await expect(page.getByText('0 creatures')).toBeVisible()
    await expect(page.getByText('No creatures match your filters.')).toBeVisible()

    await page.getByPlaceholder('Search creature').clear()
    await expect(page.getByText(countBefore!)).toBeVisible()
  })

  test('skill benefit cards show "No bonuses" initially', async ({ page }) => {
    const noBonuses = page.getByText('No bonuses')
    await expect(noBonuses.first()).toBeVisible()
  })

  test('creature rows display tier badges when creatures visible', async ({ page }) => {
    // Disable "Summoned Only" to show all creatures (no collection data in e2e)
    await page.getByRole('button', { name: 'Summoned Only' }).click()
    // Tier badges are small spans with font-mono class inside creature rows
    const tierBadge = page.locator('span.font-mono').filter({ hasText: /T\d/ }).first()
    await expect(tierBadge).toBeVisible()
  })

  test('clear all button is hidden when party is empty', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear All' })).not.toBeVisible()
  })
})
