import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./awaken')
  await page.evaluate(() => localStorage.clear())
  await page.goto('./awaken')
  await page.locator('h1', { hasText: 'Awaken Tree' }).waitFor()
})

test.describe('page rendering', () => {
  test('shows header and progression label', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Awaken Tree' })).toBeVisible()
    await expect(page.getByText('Progression').first()).toBeVisible()
  })

  test('summary bar shows total upgrades and zero progress by default', async ({ page }) => {
    await expect(page.getByText(/0 of \d+ upgrades/)).toBeVisible()
  })

  test('renders the three category tabs with counts', async ({ page }) => {
    const tabBar = page.locator('.border-b.border-border').first()
    await expect(tabBar.locator('button').filter({ hasText: 'Gathering' })).toBeVisible()
    await expect(tabBar.locator('button').filter({ hasText: 'Workstations' })).toBeVisible()
    await expect(tabBar.locator('button').filter({ hasText: 'Gold' })).toBeVisible()
    // Each tab shows "(owned/total)" in parentheses, e.g. "Gathering (0/12)"
    await expect(tabBar.locator('button').filter({ hasText: /\(\d+\/\d+\)/ })).toHaveCount(3)
  })

  test('legend lists every node state', async ({ page }) => {
    // Scope to the legend region (the only mono row carrying all five labels) to avoid
    // colliding with the summary bar's optional "simulated/removed" badges.
    const legend = page.locator('.font-mono.text-3xs').filter({ hasText: 'Locked' }).first()
    await expect(legend.getByText('From save')).toBeVisible()
    await expect(legend.getByText('Simulated')).toBeVisible()
    await expect(legend.getByText('Removed')).toBeVisible()
    await expect(legend.getByText('Available')).toBeVisible()
    await expect(legend.getByText('Locked')).toBeVisible()
  })

  test('Gathering tab is active by default', async ({ page }) => {
    const gatheringTab = page.getByRole('button', { name: /^Gathering / })
    await expect(gatheringTab).toHaveClass(/border-primary/)
  })
})

test.describe('tab switching', () => {
  test('clicking Workstations activates that tab', async ({ page }) => {
    const tab = page.getByRole('button', { name: /^Workstations / })
    await tab.click()
    await expect(tab).toHaveClass(/border-primary/)
  })

  test('clicking Gold activates that tab', async ({ page }) => {
    const tab = page.getByRole('button', { name: /^Gold / })
    await tab.click()
    await expect(tab).toHaveClass(/border-primary/)
  })

  test('Gathering tab shows the six gathering skill cards', async ({ page }) => {
    // The category cards show the skill name as a header
    await expect(page.getByText('Chopping', { exact: true })).toBeVisible()
    await expect(page.getByText('Mining', { exact: true })).toBeVisible()
    await expect(page.getByText('Digging', { exact: true })).toBeVisible()
    await expect(page.getByText('Exploring', { exact: true })).toBeVisible()
    await expect(page.getByText('Fishing', { exact: true })).toBeVisible()
    await expect(page.getByText('Farming', { exact: true })).toBeVisible()
  })

  test('Workstations tab shows the three workstation cards', async ({ page }) => {
    await page.getByRole('button', { name: /^Workstations / }).click()
    await expect(page.getByText('Furnace', { exact: true })).toBeVisible()
    await expect(page.getByText('Stove', { exact: true })).toBeVisible()
    await expect(page.getByText('Workbench', { exact: true })).toBeVisible()
  })

  test('Gold tab shows the gold-related cards', async ({ page }) => {
    await page.getByRole('button', { name: /^Gold / }).click()
    await expect(page.getByText('Awaken Gold', { exact: true })).toBeVisible()
    await expect(page.getByText('Merchant Discount', { exact: true })).toBeVisible()
    await expect(page.getByText('Sellable Bonus', { exact: true })).toBeVisible()
  })
})

test.describe('reset visibility', () => {
  test('Reset is hidden when no simulation changes exist', async ({ page }) => {
    // The button is rendered but `invisible` + aria-hidden, so resolve it via
    // text-based locator rather than the accessibility tree.
    const reset = page.locator('button').filter({ hasText: 'Reset' })
    await expect(reset).not.toBeVisible()
  })

  test('Reset becomes visible after a simulated upgrade is added', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('awaken-sim-added', JSON.stringify(['awaken-gold-i']))
    })
    await page.reload()
    await page.locator('h1', { hasText: 'Awaken Tree' }).waitFor()

    const reset = page.getByRole('button', { name: 'Reset' })
    await expect(reset).toBeVisible()
  })
})

test.describe('saved + simulated state', () => {
  test('saved awaken-gold level surfaces a "from save" badge', async ({ page }) => {
    // Seed two saved gold tiers via the canonical localStorage key
    await page.evaluate(() => {
      localStorage.setItem('config-awaken-gold-level', '2')
    })
    await page.reload()
    await page.locator('h1', { hasText: 'Awaken Tree' }).waitFor()

    // Switch to the Gold tab where the upgrades live
    await page.getByRole('button', { name: /^Gold / }).click()

    // "from save" badge counts include the two gold tiers
    await expect(page.getByText(/\d+ from save/)).toBeVisible()
  })

  test('simulated upgrade surfaces a "simulated" badge', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('awaken-sim-added', JSON.stringify(['awaken-gold-i']))
    })
    await page.reload()
    await page.locator('h1', { hasText: 'Awaken Tree' }).waitFor()

    await expect(page.getByText(/\+\d+ simulated/)).toBeVisible()
  })

  test('Reset clears the simulation deltas and hides the badge', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('awaken-sim-added', JSON.stringify(['awaken-gold-i']))
    })
    await page.reload()
    await page.locator('h1', { hasText: 'Awaken Tree' }).waitFor()

    await expect(page.getByText(/\+\d+ simulated/)).toBeVisible()
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(page.getByText(/\+\d+ simulated/)).not.toBeVisible()
  })
})
