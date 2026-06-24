import { computed, ref, type Ref } from 'vue'

import type SummoningMaterialTree from '@/components/summoning-planner/SummoningMaterialTree.vue'
import { biomeMap } from '@/data/entityMaps'
import { expeditionSourceIndex } from '@/data/indexes'
import type { Biome, Creature, Expedition } from '@/types'
import {
  calculateDuration,
  calculatePartyScore,
  getLootAmount,
  getRecommendedCreatures,
} from '@/utils/formulas'
import { getSourceGroup } from '@/utils/planner/plannerSourceGroups'

type TreeRef = InstanceType<typeof SummoningMaterialTree>

export interface ExpeditionPartyVariant {
  party: { creature: Creature; rating: number }[]
  durationPerRun: number
  totalTime: number
  runsNeeded: number
}

export interface ExpeditionAllocation {
  expeditionName: string
  rewardItemId: string
  tier: number
  lootPerRun: number
  primary: ExpeditionPartyVariant
  alternatives: ExpeditionPartyVariant[]
}

export interface CreatureExpeditionEntry {
  name: string
  rewardItemId: string
}

export interface UseExpeditionAllocationOptions {
  sortedCosts: Ref<{ itemId: string; itemName: string; amount: number }[]>
  treeRefs: Ref<TreeRef[]>
  ownedCreaturesList: Ref<Creature[]>
  collectionLevels: Ref<Record<string, number>>
}

/**
 * Expedition party recommendations with deconfliction. For every Expedition-group material
 * it picks a minimal party (diminishing-returns sized) against a greedily-reserved creature
 * pool — hardest bottleneck first — exposes per-item variant selection, and detects
 * creatures double-booked across active parties (the conflict popover).
 */
export function useExpeditionAllocation(opts: UseExpeditionAllocationOptions) {
  const { sortedCosts, treeRefs, ownedCreaturesList, collectionLevels } = opts

  function buildPartyVariant(
    recommended: { creature: Creature; rating: number; level: number }[],
    expedition: Expedition,
    tier: number,
    targetAmount: number,
    sourceAmount: number,
    biome: Biome | undefined,
  ): ExpeditionPartyVariant | null {
    if (recommended.length === 0) return null

    // Find minimal party with diminishing returns threshold
    let bestPartySize = 1
    let bestTime = Infinity

    for (let size = 1; size <= Math.min(expedition.maxPartySize, recommended.length); size++) {
      const party = recommended.slice(0, size).map((p) => p.creature)
      const score = calculatePartyScore(party, expedition, collectionLevels.value, biome)
      const duration = calculateDuration(score, expedition, tier)
      const loot = getLootAmount(sourceAmount, tier)
      const runs = Math.ceil(targetAmount / loot)
      const totalTime = runs * duration

      if (size === 1) {
        bestTime = totalTime
        bestPartySize = 1
      } else {
        const improvement = (bestTime - totalTime) / bestTime
        if (improvement > 0.1) {
          bestTime = totalTime
          bestPartySize = size
        } else {
          break
        }
      }
    }

    const minimalParty = recommended.slice(0, bestPartySize)
    const partyCreatures = minimalParty.map((p) => p.creature)
    const score = calculatePartyScore(partyCreatures, expedition, collectionLevels.value, biome)
    const loot = getLootAmount(sourceAmount, tier)

    return {
      party: minimalParty.map((p) => ({ creature: p.creature, rating: p.rating })),
      durationPerRun: calculateDuration(score, expedition, tier),
      totalTime: bestTime,
      runsNeeded: Math.ceil(targetAmount / loot),
    }
  }

  // Track user-selected party variant per item
  const selectedVariantByItem = ref<Record<string, number>>({}) // itemId → variant index (0 = primary)

  const expeditionAllocations = computed(() => {
    const allocations = new Map<number, ExpeditionAllocation>()

    // 1. Collect all expedition-group items with their best expedition
    interface ExpeditionEntry {
      sortedIndex: number
      itemId: string
      targetAmount: number
      expedition: Expedition
      tier: number
      sourceAmount: number
    }

    const entries: ExpeditionEntry[] = []
    for (let i = 0; i < sortedCosts.value.length; i++) {
      const cost = sortedCosts.value[i]
      if (getSourceGroup(cost.itemId) !== 'Expedition') continue
      const tree = treeRefs.value[i]
      if (!tree?.expeditionResult?.best) continue

      const best = tree.expeditionResult.best
      const sources = expeditionSourceIndex.get(cost.itemId)
      const source = sources?.find((s) => s.expeditionId === best.expedition.id)
      if (!source) continue

      const targetAmount = tree.rootNode?.requiredAmount ?? cost.amount
      if (targetAmount <= 0) continue // Fully stocked, no expedition needed

      entries.push({
        sortedIndex: i,
        itemId: cost.itemId,
        targetAmount,
        expedition: best.expedition,
        tier: best.tier,
        sourceAmount: source.amount,
      })
    }

    // 2. Sort by total time desc (hardest bottleneck gets first pick of creatures)
    entries.sort((a, b) => {
      const timeA = treeRefs.value[a.sortedIndex]?.expeditionResult?.best?.totalTime ?? 0
      const timeB = treeRefs.value[b.sortedIndex]?.expeditionResult?.best?.totalTime ?? 0
      return timeB - timeA
    })

    // 3. Greedily allocate creatures
    const reservedCreatureIds = new Set<string>()

    for (const entry of entries) {
      const biome = biomeMap.get(entry.expedition.biome)

      // Primary: best available creatures (excluding reserved)
      const availableForPrimary = getRecommendedCreatures(
        ownedCreaturesList.value,
        entry.expedition,
        collectionLevels.value,
        biome,
        reservedCreatureIds,
      )
      const primary = buildPartyVariant(
        availableForPrimary,
        entry.expedition,
        entry.tier,
        entry.targetAmount,
        entry.sourceAmount,
        biome,
      )

      // Generate alternatives
      const alternatives: ExpeditionPartyVariant[] = []

      if (primary) {
        // Alt 1: Use all creatures (ignoring reservations) — shows what's optimal if no conflicts
        const allCreatures = getRecommendedCreatures(
          ownedCreaturesList.value,
          entry.expedition,
          collectionLevels.value,
          biome,
        )
        const unrestricted = buildPartyVariant(
          allCreatures,
          entry.expedition,
          entry.tier,
          entry.targetAmount,
          entry.sourceAmount,
          biome,
        )
        // Only add if different from primary
        if (unrestricted && unrestricted.totalTime < primary.totalTime * 0.95) {
          alternatives.push(unrestricted)
        }

        // Alt 2: Smaller party (1 fewer creature from primary)
        if (primary.party.length > 1) {
          const smallerRecommended = availableForPrimary.slice(0, primary.party.length - 1)
          const smaller = buildPartyVariant(
            smallerRecommended,
            entry.expedition,
            entry.tier,
            entry.targetAmount,
            entry.sourceAmount,
            biome,
          )
          if (smaller) {
            alternatives.push(smaller)
          }
        }

        // Reserve creatures from primary party
        for (const member of primary.party) {
          reservedCreatureIds.add(member.creature.id)
        }
      }

      if (primary) {
        allocations.set(entry.sortedIndex, {
          expeditionName: entry.expedition.name,
          rewardItemId: entry.expedition.rewards[0]?.itemId ?? '',
          tier: entry.tier,
          lootPerRun: getLootAmount(entry.sourceAmount, entry.tier),
          primary,
          alternatives,
        })
      }
    }

    return allocations
  })

  function getActiveExpeditionParty(
    sortedIndex: number,
  ): (ExpeditionAllocation & { activeVariant: ExpeditionPartyVariant }) | null {
    const allocation = expeditionAllocations.value.get(sortedIndex)
    if (!allocation) return null
    const itemId = sortedCosts.value[sortedIndex]?.itemId
    const variantIndex = itemId ? (selectedVariantByItem.value[itemId] ?? 0) : 0
    const activeVariant =
      variantIndex === 0
        ? allocation.primary
        : (allocation.alternatives[variantIndex - 1] ?? allocation.primary)
    return { ...allocation, activeVariant }
  }

  function selectExpeditionVariant(itemId: string, variantIndex: number) {
    selectedVariantByItem.value = { ...selectedVariantByItem.value, [itemId]: variantIndex }
  }

  /** Get the alternatives to show — swaps active selection back into the list and removes it from alts */
  function getDisplayedAlternatives(
    sortedIndex: number,
  ): { variant: ExpeditionPartyVariant; targetIndex: number }[] {
    const allocation = expeditionAllocations.value.get(sortedIndex)
    if (!allocation) return []
    const itemId = sortedCosts.value[sortedIndex]?.itemId
    const activeIndex = itemId ? (selectedVariantByItem.value[itemId] ?? 0) : 0

    const result: { variant: ExpeditionPartyVariant; targetIndex: number }[] = []

    // If an alt is active, show the original primary as a swappable option
    if (activeIndex > 0) {
      result.push({ variant: allocation.primary, targetIndex: 0 })
    }

    // Show non-active alternatives
    for (let i = 0; i < allocation.alternatives.length; i++) {
      if (i + 1 !== activeIndex) {
        result.push({ variant: allocation.alternatives[i], targetIndex: i + 1 })
      }
    }

    return result
  }

  // Detect creatures used in multiple active parties
  const creatureExpeditionMap = computed(() => {
    const map = new Map<string, CreatureExpeditionEntry[]>()
    for (const [sortedIndex] of expeditionAllocations.value) {
      const active = getActiveExpeditionParty(sortedIndex)
      if (!active) continue
      const entry: CreatureExpeditionEntry = {
        name: active.expeditionName,
        rewardItemId: active.rewardItemId,
      }
      for (const member of active.activeVariant.party) {
        const list = map.get(member.creature.id)
        if (list) list.push(entry)
        else map.set(member.creature.id, [entry])
      }
    }
    return map
  })

  const conflictedCreatureIds = computed(() => {
    const conflicts = new Set<string>()
    for (const [id, entries] of creatureExpeditionMap.value) {
      if (entries.length > 1) conflicts.add(id)
    }
    return conflicts
  })

  // Conflict popover state
  const conflictPopover = ref<{
    creatureId: string
    otherExpeditions: CreatureExpeditionEntry[]
    style: Record<string, string>
  } | null>(null)

  function onConflictEnter(creatureId: string, currentExpedition: string, event: MouseEvent) {
    if (!conflictedCreatureIds.value.has(creatureId)) return
    const target = event.currentTarget as HTMLElement
    if (!target) return
    const rect = target.getBoundingClientRect()
    const GAP = 8
    const POPOVER_WIDTH = 288
    const viewportWidth = document.documentElement.clientWidth
    let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
    left = Math.max(GAP, Math.min(left, viewportWidth - POPOVER_WIDTH - GAP))
    const allExpeditions = creatureExpeditionMap.value.get(creatureId) ?? []
    const otherExpeditions = allExpeditions.filter((e) => e.name !== currentExpedition)
    conflictPopover.value = {
      creatureId,
      otherExpeditions,
      style: { position: 'fixed', top: `${rect.top - GAP}px`, left: `${left}px` },
    }
  }

  function onConflictLeave() {
    conflictPopover.value = null
  }

  return {
    expeditionAllocations,
    getActiveExpeditionParty,
    selectExpeditionVariant,
    getDisplayedAlternatives,
    conflictedCreatureIds,
    conflictPopover,
    onConflictEnter,
    onConflictLeave,
  }
}
