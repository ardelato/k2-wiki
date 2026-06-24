/** THROWAWAY — what actually changes (Sanctuary/awaken) after summoning fishing creatures. */
import { readFileSync } from 'node:fs'

import { test, expect } from 'vitest'

import { JOB_TIER_BENEFITS, MAX_SANCTUARY_SLOTS } from '@/utils/planner/sanctuaryConstants'
import { decryptSave } from '@/utils/save/decrypt'
import { extractSaveConfig, calculateJobTiersFromSanctuary } from '@/utils/save/parseSave'

async function loadSave(p: string) {
  const t = readFileSync(p, 'utf-8')
  try {
    return JSON.parse(t) as Record<string, unknown>
  } catch {
    return (await decryptSave(t)) as Record<string, unknown>
  }
}

test('post-summon sanctuary/awaken reality', async () => {
  const raw = await loadSave(process.env.KOLTERA_SAVE ?? 'e2e/fixtures/save.json')
  const cfg = extractSaveConfig(raw)
  const tierOf = (ids: string[]) => calculateJobTiersFromSanctuary(ids).Fishing ?? 0
  const dur = (tier: number) => JOB_TIER_BENEFITS[tier]?.durationReduction ?? 0

  const cur = cfg.sanctuary
  const steps = [
    { label: 'current', ids: cur },
    { label: '+Zorb', ids: [...cur, 'zorb'] },
    { label: '+Zorb +Floe', ids: [...cur, 'zorb', 'floe'] },
    { label: '+Zorb +Floe +Blorp', ids: [...cur, 'zorb', 'floe', 'blorp'] },
  ].map((s) => ({
    label: s.label,
    fishingTier: tierOf(s.ids),
    durationReduction: dur(tierOf(s.ids)) + '%',
  }))

  const report = {
    sanctuarySlots: `${cur.length}/${MAX_SANCTUARY_SLOTS}`,
    sanctuaryNote:
      cur.length >= MAX_SANCTUARY_SLOTS
        ? 'FULL — adding a creature requires swapping one out'
        : 'has free slots',
    fishingTierProgression: steps,
    awakenFishing: cfg.awakenGatherUpgrades.Fishing ?? { durationTier: 0, yieldBonus: 0 },
    awakenNote:
      'each summoned+awakened creature → +1 awaken point → can fund a Fishing yield node (the big lever)',
  }
  // eslint-disable-next-line no-console
  console.log('\n===== POST-SUMMON REALITY =====\n' + JSON.stringify(report, null, 2))
  expect(steps.length).toBe(4)
})
