<script setup lang="ts">
import { ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/composables/useCraftPlanner'
import { useMachines } from '@/composables/useMachines'
import { itemName } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { getMachineImage as getMachineImageFromData } from '@/utils/machineImages'

const { getMachineById } = useMachines()


function getMachineImage(machineId: string): string | undefined {
  const machine = getMachineById(machineId)
  if (!machine) return undefined
  return getMachineImageFromData(machine)
}


function getMachineName(machineId: string): string {
  return getMachineById(machineId)?.name ?? machineId
}


const props = defineProps<{
  inventoryAmounts: Record<string, number>
  gardenFlowers: Record<string, GardenFlowerEntry[]>
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number>
  jobTiers: Record<string, number>
  machineLevels: Record<string, number>
  fabricationAllocations: Record<string, number>
  treeItems: { itemId: string; itemName: string; itemType: string }[]
}>()


const treeItemIds = computed(() => new Set(props.treeItems.map((i) => i.itemId)))


const stockedItems = computed(() =>
  Object.entries(props.inventoryAmounts)
    .filter(([itemId, amount]) => amount > 0 && treeItemIds.value.has(itemId))
    .map(([itemId, amount]) => ({
      itemId,
      itemName: props.treeItems.find((i) => i.itemId === itemId)?.itemName ?? itemId,
      amount,
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName)),
)


const flowerTypes: Record<string, string> = {
  'fire-flower': 'Fire Flower',
  'wind-flower': 'Wind Flower',
  'earth-flower': 'Earth Flower',
  'water-flower': 'Water Flower',
}


const activeFlowers = computed(() =>
  Object.entries(props.gardenFlowers)
    .filter(([, entries]) => entries.some((e) => e.count > 0))
    .map(([flowerId, entries]) => {
      const activeEntries = entries.filter((e) => e.count > 0).toSorted((a, b) => a.level - b.level)
      const totalCount = activeEntries.reduce((s, e) => s + e.count, 0)
      const yieldPerMin = activeEntries.reduce((s, e) => s + e.count * e.level, 0)
      return {
        flowerId,
        flowerName: flowerTypes[flowerId] ?? flowerId,
        totalCount,
        yieldPerMin,
        entries: activeEntries,
      }
    }),
)


const activeGatherUpgrades = computed(() =>
  Object.entries(props.awakenGatherUpgrades)
    .filter(([, u]) => u.yieldBonus > 0 || u.durationTier > 0)
    .map(([jobId, u]) => ({
      jobId,
      yieldBonus: u.yieldBonus,
      durationPct: u.durationTier * 5,
    })),
)


const activeSpeedTiers = computed(() =>
  Object.entries(props.awakenSpeedTiers)
    .filter(([, tier]) => tier > 0)
    .map(([workstation, tier]) => ({
      workstation,
      pct: tier * 10,
    })),
)


const activeJobTiers = computed(() =>
  Object.entries(props.jobTiers)
    .filter(([, tier]) => tier > 0)
    .map(([jobId, tier]) => ({
      jobId,
      pct: tier * 10,
    })),
)


const activeMachineLevels = computed(() =>
  Object.entries(props.machineLevels)
    .filter(([, level]) => level > 0)
    .map(([id, level]) => ({ id, level })),
)


const activeFabricationItems = computed(() =>
  Object.entries(props.fabricationAllocations)
    .filter(([itemId, p]) => p > 0 && treeItemIds.value.has(itemId))
    .map(([itemId, points]) => ({ itemId, points })),
)


const isOpen = ref(false)


const activeCount = computed(
  () =>
    stockedItems.value.length +
    activeFlowers.value.length +
    activeGatherUpgrades.value.length +
    activeSpeedTiers.value.length +
    activeJobTiers.value.length +
    activeMachineLevels.value.length +
    activeFabricationItems.value.length,
)


const hasAnything = computed(() => activeCount.value > 0)
</script>

<template>
  <div v-if="hasAnything" class="surface-card overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-3">
      <button
        class="focus-ring -mx-1 flex flex-1 items-center gap-2 rounded-lg px-1 text-left transition hover:bg-muted/15"
        @click="isOpen = !isOpen"
      >
        <component :is="isOpen ? ChevronDown : ChevronRight" class="size-4 text-muted-foreground" />
        <SlidersHorizontal class="size-4 text-primary" />
        <span class="text-sm font-bold text-foreground">Active Modifiers</span>
        <span
          class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
        >
          {{ activeCount }}
        </span>
      </button>
    </div>

    <div v-if="isOpen" class="space-y-3 px-4 pb-4">
      <!-- In Stock -->
      <div v-if="stockedItems.length" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: rgb(52, 211, 153)"
        >
          In Stock
        </p>
        <div class="space-y-1">
          <div
            v-for="item in stockedItems"
            :key="item.itemId"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="getItemImage({ id: item.itemId })"
              :src="getItemImage({ id: item.itemId })"
              :alt="item.itemName"
              class="size-5 object-contain"
              loading="lazy"
            />
            <span class="min-w-0 truncate text-sm text-foreground">{{ item.itemName }}</span>
            <span
              class="ml-auto shrink-0 font-mono text-sm font-semibold"
              style="color: rgb(52, 211, 153)"
            >
              x{{ item.amount.toLocaleString() }}
            </span>
          </div>
        </div>
      </div>

      <!-- Garden -->
      <div v-if="activeFlowers.length" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: rgb(163, 230, 53)"
        >
          Garden
        </p>
        <div class="space-y-2">
          <div
            v-for="flower in activeFlowers"
            :key="flower.flowerId"
            class="rounded-lg border border-border/40 bg-background/30 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <img
                v-if="getItemImage({ id: flower.flowerId })"
                :src="getItemImage({ id: flower.flowerId })"
                :alt="flower.flowerName"
                class="size-5 object-contain"
                loading="lazy"
              />
              <span class="min-w-0 text-sm font-semibold text-foreground">{{
                flower.flowerName
              }}</span>
              <span class="ml-auto shrink-0 text-[11px] text-muted-foreground"
                >{{ flower.totalCount }} flower{{ flower.totalCount === 1 ? '' : 's' }}</span
              >
              <span
                class="shrink-0 font-mono text-sm font-semibold"
                style="color: rgb(163, 230, 53)"
              >
                {{ flower.yieldPerMin }}/min
              </span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <span
                v-for="entry in flower.entries"
                :key="entry.level"
                class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
                :class="
                  entry.level >= 4
                    ? 'border-lime-700/40 bg-lime-100 text-lime-800 dark:border-lime-400/40 dark:bg-lime-400/10 dark:text-lime-300'
                    : entry.level >= 2
                      ? 'border-lime-700/25 bg-lime-50 text-lime-700 dark:border-lime-400/25 dark:bg-lime-400/5 dark:text-lime-300/80'
                      : 'border-border/50 bg-background/50 text-muted-foreground'
                "
              >
                <span class="font-bold">{{ entry.count }}×</span>
                <span>Lv{{ entry.level }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Awaken Gather -->
      <div v-if="activeGatherUpgrades.length" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: rgb(52, 211, 153)"
        >
          Awaken Gather
        </p>
        <div class="space-y-1">
          <div
            v-for="upgrade in activeGatherUpgrades"
            :key="upgrade.jobId"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="sourceIcons[upgrade.jobId]"
              :src="sourceIcons[upgrade.jobId]"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span class="min-w-0 text-sm text-foreground">{{ upgrade.jobId }}</span>
            <div class="ml-auto flex items-center gap-3">
              <span
                v-if="upgrade.yieldBonus > 0"
                class="text-xs font-semibold"
                style="color: rgb(52, 211, 153)"
              >
                Yield +{{ upgrade.yieldBonus }}
              </span>
              <span
                v-if="upgrade.durationPct > 0"
                class="text-xs font-semibold"
                style="color: rgb(52, 211, 153)"
              >
                Duration -{{ upgrade.durationPct }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Awaken Speed -->
      <div v-if="activeSpeedTiers.length" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: hsl(var(--primary))"
        >
          Awaken Speed
        </p>
        <div class="space-y-1">
          <div
            v-for="ws in activeSpeedTiers"
            :key="ws.workstation"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="sourceIcons[ws.workstation]"
              :src="sourceIcons[ws.workstation]"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span class="min-w-0 text-sm text-foreground">{{ ws.workstation }}</span>
            <span class="ml-auto shrink-0 text-xs font-semibold" style="color: hsl(var(--primary))">
              +{{ ws.pct }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Job Tiers -->
      <div v-if="activeJobTiers.length" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: rgb(52, 211, 153)"
        >
          Job Tiers
        </p>
        <div class="space-y-1">
          <div
            v-for="job in activeJobTiers"
            :key="job.jobId"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="sourceIcons[job.jobId]"
              :src="sourceIcons[job.jobId]"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span class="min-w-0 text-sm text-foreground">{{ job.jobId }}</span>
            <span class="ml-auto shrink-0 text-xs font-semibold" style="color: rgb(52, 211, 153)">
              Duration -{{ job.pct }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Machine Levels -->
      <div v-if="activeMachineLevels.length" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: hsl(var(--primary))"
        >
          Machine Levels
        </p>
        <div class="space-y-1">
          <div
            v-for="machine in activeMachineLevels"
            :key="machine.id"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="getMachineImage(machine.id)"
              :src="getMachineImage(machine.id)"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span class="min-w-0 text-sm text-foreground">{{ getMachineName(machine.id) }}</span>
            <span class="ml-auto shrink-0 text-xs font-semibold" style="color: hsl(var(--primary))">
              Lv{{ machine.level }}
            </span>
          </div>
        </div>
      </div>

      <!-- Fabrication -->
      <div v-if="activeFabricationItems.length > 0" class="space-y-1">
        <p
          class="text-[11px] font-bold uppercase tracking-[0.16em]"
          style="color: rgb(52, 211, 153)"
        >
          Fabrication
        </p>
        <div class="space-y-1">
          <div
            v-for="fab in activeFabricationItems"
            :key="fab.itemId"
            class="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-muted/20"
          >
            <img
              v-if="getItemImage({ id: fab.itemId })"
              :src="getItemImage({ id: fab.itemId })"
              alt=""
              class="size-4 shrink-0"
              loading="lazy"
            />
            <span class="min-w-0 text-sm text-foreground">{{ itemName(fab.itemId) }}</span>
            <span class="ml-auto shrink-0 text-xs font-semibold" style="color: rgb(52, 211, 153)">
              {{ fab.points * 20 }}/hr
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
