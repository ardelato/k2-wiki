/** THROWAWAY — audit the live completion queue on the real save (all-T5). */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import creaturesData from '@/data/creatures.json'
import itemsData from '@/data/items.json'
import { buildCompletionQueue, type QueueInputCreature } from '@/utils/planner/completionQueue'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig } from '@/utils/save/parseSave'

interface Cr {
  id: string
  name: string
  tier: number
  summoningCost?: { id: string; amount: number }[]
}
const CREATURES = creaturesData as Cr[]
const NAME = new Map(
  (itemsData as { id: string; name?: string }[]).map((i) => [i.id, i.name ?? i.id]),
)
async function loadSave(p: string) {
  const t = readFileSync(p, 'utf-8')
  try {
    return JSON.parse(t) as Record<string, unknown>
  } catch {
    return (await decryptSave(t)) as Record<string, unknown>
  }
}

test('completion queue audit', async () => {
  const raw = await loadSave(process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json')
  const cfg = extractSaveConfig(raw)
  const inv = cfg.inventory
  const owned = new Set(
    (raw.creatures as { species?: string }[] | undefined)?.map((c) => c.species) ?? [],
  )
  const backlog = CREATURES.filter(
    (c) => c.tier === 4 && (c.summoningCost?.length ?? 0) > 0 && !owned.has(c.id),
  )

  const input: QueueInputCreature[] = backlog.map((c) => ({
    id: c.id,
    name: c.name,
    image: null,
    blocked: false,
    requirements: (c.summoningCost ?? []).map((s) => ({
      itemId: s.id,
      itemName: NAME.get(s.id) ?? s.id,
      need: s.amount,
      have: inv[s.id] ?? 0,
      sourceLabel: '',
      sourceIcon: null,
    })),
  }))

  const q = buildCompletionQueue(input)
  const view = q.map((c) => ({
    creature: c.name,
    pct: c.readiness,
    ready: `${c.fulfilled}/${c.total}`,
    needs: c.remaining.map((r) => `${r.itemName} ${Math.round(r.need - r.have)}/${r.need}`),
  }))
  // Spotlight the shared-fish creatures to confirm depletion across them.
  const fish = q.filter(
    (c) =>
      c.remaining.some((r) => r.itemId === 'rainbow-fish') ||
      ['zorb', 'floe', 'blorp'].includes(c.id),
  )
  // eslint-disable-next-line no-console
  console.log(
    '\n===== QUEUE AUDIT =====\n' +
      JSON.stringify(
        {
          inventoryFishRelated: {
            'rainbow-fish': inv['rainbow-fish'] ?? 0,
            pineapple: inv['pineapple'] ?? 0,
            'dungeon-rune': inv['dungeon-rune'] ?? 0,
          },
          top8: view.slice(0, 8),
          fishCreaturesInOrder: q
            .filter((c) => ['Zorb', 'Floe', 'Blorp'].includes(c.name))
            .map((c) => ({
              name: c.name,
              pct: c.readiness,
              fishNeed: c.remaining.find((r) => r.itemId === 'rainbow-fish')?.need ?? 'covered',
            })),
        },
        null,
        2,
      ),
  )
  expect(q.length).toBe(backlog.length)
  void fish
})
