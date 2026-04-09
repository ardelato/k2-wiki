import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./items')
  await page.getByPlaceholder('Search items').waitFor()
})

/** Count visible item cards (each ItemCard is an <article>) */
function itemCards(page: import('@playwright/test').Page) {
  return page.locator('article')
}

// ── Search & filtering ───────────────────────────────────────────────

test.describe('search and filtering', () => {
  test('search by name filters items', async ({ page }) => {
    await page.getByPlaceholder('Search items').fill('Chopping Charm')
    await expect(itemCards(page)).toHaveCount(1)
  })

  test('clear search restores all items', async ({ page }) => {
    await page.getByPlaceholder('Search items').fill('Chopping Charm')
    await expect(itemCards(page)).toHaveCount(1)

    await page.getByPlaceholder('Search items').fill('')
    await expect(itemCards(page)).toHaveCount(192)
  })

  test('type filter narrows results', async ({ page }) => {
    await page.getByRole('radio', { name: 'Gathered' }).click()

    const count = await itemCards(page).count()
    expect(count).toBe(118)
  })

  test('source category filter narrows results', async ({ page }) => {
    await page.getByRole('radio', { name: 'Job' }).click()

    const count = await itemCards(page).count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(192)
  })

  test('combined type + source narrows further', async ({ page }) => {
    await page.getByRole('radio', { name: 'Gathered' }).click()
    const typeCount = await itemCards(page).count()

    await page.getByRole('radio', { name: 'Job' }).click()
    const combinedCount = await itemCards(page).count()

    expect(combinedCount).toBeLessThanOrEqual(typeCount)
  })

  test('resetting type filter to All restores results', async ({ page }) => {
    await page.getByRole('radio', { name: 'Gathered' }).click()
    const filteredCount = await itemCards(page).count()
    expect(filteredCount).toBeLessThan(192)

    await page.getByRole('radio', { name: 'Gathered' }).click()
    await expect(itemCards(page)).toHaveCount(192)
  })
})

// ── Grid & table views ───────────────────────────────────────────────

test.describe('grid and table views', () => {
  test('default grid view renders item cards', async ({ page }) => {
    await expect(itemCards(page)).toHaveCount(192)
  })

  test('switch to table renders rows', async ({ page }) => {
    await page.getByRole('radio', { name: 'Table' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(192)
  })

  test('default sort is name ascending', async ({ page }) => {
    await page.getByRole('radio', { name: 'Table' }).click()

    // Default sort is name ascending
    await expect(page.locator('th[aria-sort="ascending"]')).toBeVisible()

    const firstCell = page.locator('tbody tr:first-child td:first-child')
    const secondCell = page.locator('tbody tr:nth-child(2) td:first-child')
    const first = await firstCell.textContent()
    const second = await secondCell.textContent()
    expect(first!.trim().localeCompare(second!.trim())).toBeLessThanOrEqual(0)
  })

  test('clicking active sort header toggles to descending', async ({ page }) => {
    await page.getByRole('radio', { name: 'Table' }).click()

    // Name is default sort — clicking toggles to descending
    await page.getByRole('button', { name: /Name/ }).click()

    await expect(page.locator('th[aria-sort="descending"]')).toBeVisible()

    const firstCell = page.locator('tbody tr:first-child td:first-child')
    const secondCell = page.locator('tbody tr:nth-child(2) td:first-child')
    const first = await firstCell.textContent()
    const second = await secondCell.textContent()
    expect(first!.trim().localeCompare(second!.trim())).toBeGreaterThanOrEqual(0)
  })

  test('search filters table rows', async ({ page }) => {
    await page.getByRole('radio', { name: 'Table' }).click()
    await page.getByPlaceholder('Search items').fill('Chopping Charm')
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })
})

// ── Item selection & detail panel ────────────────────────────────────

test.describe('item selection and detail panel', () => {
  test('clicking item card opens detail panel', async ({ page }) => {
    await itemCards(page).first().click()

    const detail = page.locator('aside:not(.sidebar-rail)')
    await expect(detail).toBeVisible()
    // Detail should show an item name in an h2
    await expect(detail.locator('h2')).not.toBeEmpty()
  })

  test('detail panel shows item type', async ({ page }) => {
    await itemCards(page).first().click()

    const detail = page.locator('aside:not(.sidebar-rail)')
    // Type badge should be visible (Currency, Gathered, etc.)
    const typeBadge = detail
      .locator('span')
      .filter({ hasText: /^(Currency|Gathered|Refined|Sellable|Consumable|Container)$/ })
    await expect(typeBadge.first()).toBeVisible()
  })

  test('clicking a different item switches detail', async ({ page }) => {
    await itemCards(page).first().click()
    const firstName = await page.locator('aside h2').textContent()

    await itemCards(page).nth(1).click()
    const secondName = await page.locator('aside h2').textContent()

    expect(firstName).not.toBe(secondName)
  })

  test('query param pre-selects item on load', async ({ page }) => {
    await page.goto('./items?item=chopping-charm')
    await page.locator('aside:not(.sidebar-rail)').waitFor()

    const detail = page.locator('aside:not(.sidebar-rail)')
    await expect(detail).toBeVisible()
    await expect(detail.locator('h2')).toContainText('Chopping Charm')
  })
})

// ── Detail panel navigation ──────────────────────────────────────────

test.describe('detail panel navigation', () => {
  test('clicking linked item in detail navigates to that item', async ({ page }) => {
    // Open Coal which has many recipes with ingredient links
    await page.goto('./items?item=coal')
    await page.locator('aside:not(.sidebar-rail)').waitFor()

    const detail = page.locator('aside:not(.sidebar-rail)')
    await expect(detail.locator('h2')).toContainText('Coal')

    // Find a clickable item button within the recipes/ingredients section
    // These are buttons that navigate to other items
    const itemLink = detail.locator('button[class*="cursor-pointer"]').first()
    if (await itemLink.isVisible()) {
      await itemLink.click()
      // The detail panel should now show a different item
      await expect(detail.locator('h2')).not.toContainText('Coal')
    }
  })
})
