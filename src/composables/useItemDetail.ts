import { computed, type Ref } from 'vue'

import { useItems } from '@/composables/useItems'
import expeditionsData from '@/data/expeditions.json'
import { summoningIndex } from '@/data/indexes'
import type { Item, JobActivitySource } from '@/types'

const expeditionById = new Map(expeditionsData.map((e) => [e.id, e]))

interface JobSourceGroup {
  jobId: string
  sources: JobActivitySource[]
  count: number
  levelRange: [number, number]
  chanceRange: [number, number]
}

export interface MergedRecipe {
  workstation: string
  levelRequirement: number
  craftTime: number
  experience: [number, number]
  outputAmount: number
  sharedIngredients: { id: string; amount: number }[]
  varyingIngredients: { id: string; amount: number }[][]
}

export function useItemDetail(item: Ref<Item>) {
  const { getJobSources, getRecipeUsages, getContainerSources, getItemById } = useItems()

  const summoningCreatures = computed(() => summoningIndex.get(item.value.id) ?? [])

  const jobSources = computed(() => {
    const sources = getJobSources(item.value.id)
    // For containers, deduplicate to just show the skill name
    if (item.value.type === 'Container') {
      const seen = new Set<string>()
      return sources.filter((s) => {
        if (seen.has(s.jobId)) return false
        seen.add(s.jobId)
        return true
      })
    }
    return sources
  })

  const recipeUsages = computed(() => getRecipeUsages(item.value.id))
  const containerSources = computed(() => getContainerSources(item.value.id))

  const expeditionSources = computed(() => {
    return (item.value.sources ?? [])
      .filter((s) => s?.startsWith('expedition_'))
      .map((s) => {
        const expId = s.replace('expedition_', '')
        return expeditionById.get(expId)
      })
      .filter(Boolean) as typeof expeditionsData
  })

  const groupedJobSources = computed<JobSourceGroup[]>(() => {
    const groups = new Map<string, JobActivitySource[]>()
    for (const js of jobSources.value) {
      const arr = groups.get(js.jobId)
      if (arr) arr.push(js)
      else groups.set(js.jobId, [js])
    }
    return [...groups.entries()].map(([jobId, sources]) => {
      const levels = sources.map((s) => s.levelRequirement)
      const chances = sources.map((s) => s.chance)
      return {
        jobId,
        sources,
        count: sources.length,
        levelRange: [Math.min(...levels), Math.max(...levels)] as [number, number],
        chanceRange: [Math.min(...chances), Math.max(...chances)] as [number, number],
      }
    })
  })

  const dedupedRecipeUsages = computed(() => {
    const seen = new Set<string>()
    return recipeUsages.value.filter((u) => {
      if (seen.has(u.outputItemId)) return false
      seen.add(u.outputItemId)
      return true
    })
  })

  const mergedRecipes = computed<MergedRecipe[]>(() => {
    const groups = new Map<string, typeof item.value.recipes>()
    for (const r of item.value.recipes) {
      const key = `${r.workstation}|${r.levelRequirement}`
      const arr = groups.get(key)
      if (arr) arr.push(r)
      else groups.set(key, [r])
    }

    return [...groups.values()].map((recipes) => {
      const first = recipes[0]
      if (recipes.length === 1) {
        return {
          workstation: first.workstation,
          levelRequirement: first.levelRequirement,
          craftTime: first.craftTime,
          experience: [first.experience, first.experience] as [number, number],
          outputAmount: first.outputAmount,
          sharedIngredients: first.ingredients,
          varyingIngredients: [],
        }
      }

      // Find shared vs varying ingredients
      const ingredientSets = recipes.map((r) => new Map(r.ingredients.map((i) => [i.id, i.amount])))
      const allIds = new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.id)))
      const shared: { id: string; amount: number }[] = []
      const varyingIds = new Set<string>()

      for (const id of allIds) {
        const amounts = ingredientSets.map((m) => m.get(id))
        if (amounts.every((a) => a === amounts[0] && a !== undefined)) {
          shared.push({ id, amount: amounts[0]! })
        } else {
          varyingIds.add(id)
        }
      }

      const varying = recipes.map((r) => r.ingredients.filter((i) => varyingIds.has(i.id)))

      const xpValues = recipes.map((r) => r.experience)

      return {
        workstation: first.workstation,
        levelRequirement: first.levelRequirement,
        craftTime: first.craftTime,
        experience: [Math.min(...xpValues), Math.max(...xpValues)] as [number, number],
        outputAmount: first.outputAmount,
        sharedIngredients: shared,
        varyingIngredients: varying,
      }
    })
  })

  return {
    getItemById,
    summoningCreatures,
    jobSources,
    containerSources,
    expeditionSources,
    groupedJobSources,
    dedupedRecipeUsages,
    mergedRecipes,
  }
}
