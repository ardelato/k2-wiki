<script setup lang="ts">
import { ChevronDown, Clock } from 'lucide-vue-next'
import { ref, computed } from 'vue'

import { useGameConfig } from '@/composables/useGameConfig'
import { useMachines } from '@/composables/useMachines'
import { itemById } from '@/data/indexes'
import { itemName } from '@/utils/format'
import { getItemImage } from '@/utils/itemImages'
import { getMachineImage } from '@/utils/machineImages'

const typeColorMap: Record<string, string> = {
  Fire: 'var(--color-fire)',
  Water: 'var(--color-water)',
  Wind: 'var(--color-wind)',
  Earth: 'var(--color-earth)',
}


const { machines, generators, processors, upgradeCosts, speedMultipliers, getInterval } =
  useMachines()


const { machineLevels, machineRecipes } = useGameConfig()


const expandedMachineId = ref<string | null>(null)


function toggleExpand(id: string) {
  expandedMachineId.value = expandedMachineId.value === id ? null : id
}


function formatInterval(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  return `${seconds}s`
}


function formatGold(amount: number): string {
  return amount.toLocaleString()
}


function getMachineLevel(machineId: string): number {
  return machineLevels.value[machineId] ?? 0
}


function getActiveRecipe(machineId: string): string | null {
  return machineRecipes.value[machineId] ?? null
}


const hasSaveData = computed(() => Object.keys(machineLevels.value).length > 0)
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold">Machines</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Machines passively generate or process items when a creature is assigned. Upgrade them to
        increase speed.
      </p>
    </div>

    <!-- Generators -->
    <section>
      <h2 class="mb-4 text-lg font-semibold">Generators</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="machine in generators"
          :key="machine.id"
          class="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div class="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-4 py-3">
            <img
              v-if="getMachineImage(machine)"
              :src="getMachineImage(machine)!"
              :alt="machine.name"
              class="size-8"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">{{ machine.name }}</h3>
                <span
                  class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400"
                >
                  Generator
                </span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">{{ machine.description }}</p>
            </div>
          </div>

          <div class="space-y-2 px-4 py-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Cost</span>
              <div class="flex items-center gap-1.5 font-medium">
                <img
                  v-if="getItemImage({ id: 'gold' })"
                  :src="getItemImage({ id: 'gold' })!"
                  alt=""
                  class="size-4"
                  loading="lazy"
                />
                {{ formatGold(machine.cost) }}
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Output</span>
              <div class="flex items-center gap-1.5">
                <img
                  v-if="machine.outputItemId && getItemImage(itemById.get(machine.outputItemId)!)"
                  :src="getItemImage(itemById.get(machine.outputItemId)!)!"
                  alt=""
                  class="size-4"
                  loading="lazy"
                />
                <span class="font-medium">{{ itemName(machine.outputItemId!) }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Base Interval</span>
              <span class="font-medium">{{ formatInterval(machine.baseInterval) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Creature</span>
              <span class="font-medium">Any</span>
            </div>
            <template v-if="hasSaveData && getMachineLevel(machine.id) > 0">
              <div class="flex items-center justify-between border-t border-border/50 pt-2">
                <span class="text-muted-foreground">Your Level</span>
                <span class="font-semibold text-primary">{{ getMachineLevel(machine.id) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Your Interval</span>
                <span class="font-semibold text-primary">
                  {{ formatInterval(getInterval(machine.id, getMachineLevel(machine.id))) }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- Processors -->
    <section>
      <h2 class="mb-4 text-lg font-semibold">Processors</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="machine in processors"
          :key="machine.id"
          class="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div class="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-4 py-3">
            <img
              v-if="getMachineImage(machine)"
              :src="getMachineImage(machine)!"
              :alt="machine.name"
              class="size-8 shrink-0"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">{{ machine.name }}</h3>
                <div class="flex items-center gap-2">
                  <span
                    v-for="t in machine.creatureTypeRequired ?? []"
                    :key="t"
                    class="type-chip"
                    :style="{
                      '--chip-color': typeColorMap[t],
                    }"
                  >
                    {{ t }}
                  </span>
                  <span
                    v-if="!machine.creatureTypeRequired"
                    class="rounded-full border border-border bg-muted/45 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    Any
                  </span>
                  <span
                    class="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-400"
                  >
                    Processor
                  </span>
                </div>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">{{ machine.description }}</p>
            </div>
          </div>

          <div class="space-y-2 px-4 py-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Cost</span>
              <div class="flex items-center gap-1.5 font-medium">
                <img
                  v-if="getItemImage({ id: 'gold' })"
                  :src="getItemImage({ id: 'gold' })!"
                  alt=""
                  class="size-4"
                  loading="lazy"
                />
                {{ formatGold(machine.cost) }}
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Base Interval</span>
              <span class="font-medium">{{ formatInterval(machine.baseInterval) }}</span>
            </div>
            <template v-if="hasSaveData && getMachineLevel(machine.id) > 0">
              <div class="flex items-center justify-between border-t border-border/50 pt-2">
                <span class="text-muted-foreground">Your Level</span>
                <span class="font-semibold text-primary">{{ getMachineLevel(machine.id) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Your Interval</span>
                <span class="font-semibold text-primary">
                  {{ formatInterval(getInterval(machine.id, getMachineLevel(machine.id))) }}
                </span>
              </div>
            </template>

            <!-- Recipes toggle -->
            <div>
              <button
                class="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                :aria-expanded="expandedMachineId === machine.id"
                @click="toggleExpand(machine.id)"
              >
                <ChevronDown
                  class="size-3.5 transition-transform"
                  :class="expandedMachineId === machine.id ? '' : '-rotate-90'"
                />
                Recipes ({{ machine.recipes.length }})
              </button>

              <div class="mt-3" :class="expandedMachineId === machine.id ? 'block' : 'hidden'">
                <div class="space-y-1.5">
                  <div
                    v-for="recipe in machine.recipes"
                    :key="recipe.inputItemId + '-' + recipe.outputItemId"
                    class="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs"
                    :class="{
                      'ring-1 ring-primary/40':
                        hasSaveData && getActiveRecipe(machine.id) === recipe.inputItemId,
                    }"
                  >
                    <template v-if="recipe.inputAmount > 0">
                      <div class="flex items-center gap-1">
                        <img
                          v-if="getItemImage(itemById.get(recipe.inputItemId)!)"
                          :src="getItemImage(itemById.get(recipe.inputItemId)!)!"
                          alt=""
                          class="size-4"
                          loading="lazy"
                        />
                        <span>{{ recipe.inputAmount }}x {{ itemName(recipe.inputItemId) }}</span>
                      </div>
                      <template v-if="recipe.secondaryInputItemId">
                        <span class="text-muted-foreground">+</span>
                        <div class="flex items-center gap-1">
                          <img
                            v-if="getItemImage(itemById.get(recipe.secondaryInputItemId)!)"
                            :src="getItemImage(itemById.get(recipe.secondaryInputItemId)!)!"
                            alt=""
                            class="size-4"
                            loading="lazy"
                          />
                          <span>
                            {{ recipe.secondaryInputAmount }}x
                            {{ itemName(recipe.secondaryInputItemId) }}
                          </span>
                        </div>
                      </template>
                    </template>
                    <Clock v-else class="size-3.5 text-muted-foreground" />
                    <span class="text-muted-foreground">&rarr;</span>
                    <div class="flex items-center gap-1">
                      <img
                        v-if="getItemImage(itemById.get(recipe.outputItemId)!)"
                        :src="getItemImage(itemById.get(recipe.outputItemId)!)!"
                        alt=""
                        class="size-4"
                        loading="lazy"
                      />
                      <span class="font-medium">
                        {{ recipe.outputAmount }}x {{ itemName(recipe.outputItemId) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Upgrade Costs Table -->
    <section>
      <h2 class="mb-4 text-lg font-semibold">Upgrade Costs</h2>
      <div class="overflow-x-auto rounded-xl border border-border">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-muted/30">
              <th class="px-3 py-2.5 text-left font-semibold">Level</th>
              <th class="px-3 py-2.5 text-left font-semibold">Bar</th>
              <th class="px-3 py-2.5 text-right font-semibold">Bar Qty</th>
              <th class="px-3 py-2.5 text-right font-semibold">Planks</th>
              <th class="px-3 py-2.5 text-right font-semibold">Speed</th>
              <th
                v-for="(machine, i) in machines"
                :key="machine.id"
                class="px-3 py-2.5 text-center"
                :class="i === 0 && 'border-l border-border'"
                :title="machine.name"
              >
                <img
                  v-if="getMachineImage(machine)"
                  :src="getMachineImage(machine)!"
                  :alt="machine.name"
                  class="mx-auto size-5"
                  loading="lazy"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-border/50">
              <td class="px-3 py-2 font-medium">0</td>
              <td class="px-3 py-2 text-muted-foreground">—</td>
              <td class="px-3 py-2 text-right text-muted-foreground">—</td>
              <td class="px-3 py-2 text-right text-muted-foreground">—</td>
              <td class="px-3 py-2 text-right">1x</td>
              <td
                v-for="(machine, i) in machines"
                :key="machine.id"
                class="px-3 py-2 text-center tabular-nums"
                :class="i === 0 && 'border-l border-border'"
              >
                {{ formatInterval(getInterval(machine.id, 0)) }}
              </td>
            </tr>
            <tr
              v-for="(cost, index) in upgradeCosts"
              :key="index"
              class="border-b border-border/50"
            >
              <td class="px-3 py-2 font-medium">{{ index + 1 }}</td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-1.5">
                  <img
                    v-if="getItemImage(itemById.get(cost.barId)!)"
                    :src="getItemImage(itemById.get(cost.barId)!)!"
                    alt=""
                    class="size-4"
                    loading="lazy"
                  />
                  <span>{{ itemName(cost.barId) }}</span>
                </div>
              </td>
              <td class="px-3 py-2 text-right">{{ cost.barAmount }}</td>
              <td class="px-3 py-2 text-right">{{ cost.planksAmount }}</td>
              <td class="px-3 py-2 text-right">
                {{ (1 / speedMultipliers[index + 1]).toFixed(2) }}x
              </td>
              <td
                v-for="(machine, i) in machines"
                :key="machine.id"
                class="px-3 py-2 text-center tabular-nums"
                :class="i === 0 && 'border-l border-border'"
              >
                {{ formatInterval(getInterval(machine.id, index + 1)) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.type-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  border: 1px solid color-mix(in oklch, var(--chip-color) 30%, transparent);
  background: color-mix(in oklch, var(--chip-color) 15%, transparent);
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--chip-color);
}
</style>
