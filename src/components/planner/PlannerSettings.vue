<script setup lang="ts">
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { GardenFlowerEntry, AwakenGatherUpgrade } from '@/composables/useCraftPlanner'
import { useGameConfig } from '@/composables/useGameConfig'
import { useMachines } from '@/composables/useMachines'
import { itemName } from '@/utils/format'
import { sourceIcons } from '@/utils/icons'
import { getItemImage } from '@/utils/itemImages'
import { getMachineImage } from '@/utils/machineImages'

const props = defineProps<{
  treeItems: { itemId: string; itemName: string; itemType: string }[]
  inventoryAmounts: Record<string, number>
  gardenFlowers: Record<string, GardenFlowerEntry[]>
  awakenGatherUpgrades: Record<string, AwakenGatherUpgrade>
  awakenSpeedTiers: Record<string, number>
  jobTiers: Record<string, number>
  machineLevels: Record<string, number>
  fabricationAllocations: Record<string, number>
}>()


const emit = defineEmits<{
  'set-inventory': [itemId: string, amount: number]
  'reset-inventory': []
  'set-garden-flower-entries': [flowerId: string, entries: GardenFlowerEntry[]]
  'reset-garden': []
  'set-awaken-gather-yield-bonus': [jobId: string, yieldBonus: number]
  'set-awaken-gather-duration-tier': [jobId: string, tier: number]
  'set-awaken-speed-tier': [workstation: string, tier: number]
  'reset-awaken': []
  'set-job-tier': [jobId: string, tier: number]
  'reset-job-tiers': []
  'set-machine-level': [machineId: string, level: number]
  'reset-machine-levels': []
  'set-fabrication-allocation': [itemId: string, points: number]
  'reset-fabrication': []
  'reset-all': []
}>()


const { machines } = useMachines()
const { fabricationAllocations: saveFabrication } = useGameConfig()


function getFabItemState(itemId: string): 'save' | 'simulated' | 'removed' {
  const current = props.fabricationAllocations[itemId] ?? 0
  const saved = saveFabrication.value[itemId] ?? 0
  if (current > saved) return 'simulated'
  if (current < saved) return 'removed'
  return 'save'
}


const isOpen = ref(false)
const inventoryOpen = ref(false)
const gardenOpen = ref(false)
const awakenOpen = ref(false)
const machinesOpen = ref(false)
const fabricationOpen = ref(false)


function applyInventory(itemId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  const parsed = Number(value)
  emit('set-inventory', itemId, Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0)
}


const hasAnyStock = () => Object.values(props.inventoryAmounts).some((v) => v > 0)


// Garden
const flowerTypes = [
  { id: 'fire-flower', name: 'Fire Flower' },
  { id: 'wind-flower', name: 'Wind Flower' },
  { id: 'earth-flower', name: 'Earth Flower' },
  { id: 'water-flower', name: 'Water Flower' },
]


const totalFlowerCount = computed(() =>
  Object.values(props.gardenFlowers).reduce(
    (sum, entries) => sum + entries.reduce((s, e) => s + e.count, 0),
    0,
  ),
)
const remainingSlots = computed(() => 25 - totalFlowerCount.value)


function flowerYield(flowerId: string): number {
  return (props.gardenFlowers[flowerId] ?? []).reduce((sum, e) => sum + e.count * e.level, 0)
}


function flowerCount(flowerId: string): number {
  return (props.gardenFlowers[flowerId] ?? []).reduce((sum, e) => sum + e.count, 0)
}


function countAtLevel(flowerId: string, level: number): number {
  return (props.gardenFlowers[flowerId] ?? []).find((e) => e.level === level)?.count ?? 0
}


function setCountAtLevel(flowerId: string, level: number, event: Event) {
  const parsed = Number((event.target as HTMLInputElement).value)
  const entries = (props.gardenFlowers[flowerId] ?? []).filter((e) => e.level !== level)
  const currentCount = countAtLevel(flowerId, level)
  const maxAllowed = currentCount + remainingSlots.value
  const clamped = Math.max(
    0,
    Math.min(maxAllowed, Number.isFinite(parsed) ? Math.round(parsed) : 0),
  )
  if (clamped > 0) entries.push({ count: clamped, level })
  emit('set-garden-flower-entries', flowerId, entries)
}


function stepCountAtLevel(flowerId: string, level: number, delta: number) {
  const current = countAtLevel(flowerId, level)
  const maxAllowed = current + remainingSlots.value
  const next = Math.max(0, Math.min(maxAllowed, current + delta))
  const entries = (props.gardenFlowers[flowerId] ?? []).filter((e) => e.level !== level)
  if (next > 0) entries.push({ count: next, level })
  emit('set-garden-flower-entries', flowerId, entries)
}


const levels = [1, 2, 3, 4, 5, 6]


const hasGardenChanges = computed(() =>
  Object.values(props.gardenFlowers).some((entries) => entries.length > 0),
)


// Awaken Tree
const gatherJobs = ['Chopping', 'Mining', 'Digging', 'Exploring', 'Fishing', 'Farming']
const workstations = ['Furnace', 'Stove', 'Workbench']
const yieldLabels = ['None', '+1', '+2']


const hasAwakenChanges = computed(
  () =>
    Object.values(props.awakenGatherUpgrades).some((u) => u.yieldBonus > 0 || u.durationTier > 0) ||
    Object.values(props.awakenSpeedTiers).some((t) => t > 0),
)


function tierLabel(tier: number, perTier: number): string {
  const pct = tier * perTier
  return pct > 0 ? `-${pct}%` : 'None'
}


function speedTierLabel(tier: number, perTier: number): string {
  const pct = tier * perTier
  return pct > 0 ? `+${pct}%` : 'None'
}


// Job Tiers (temporary simulation overrides)
const jobs = ['Chopping', 'Mining', 'Digging', 'Exploring', 'Fishing', 'Farming']
const jobTiersOpen = ref(false)


const JOB_TIER_BENEFITS = [
  { xpBonus: 0, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 20, durationReduction: 0, yieldBonus: 0 },
  { xpBonus: 20, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 10, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 20, yieldBonus: 0 },
  { xpBonus: 40, durationReduction: 20, yieldBonus: 1 },
]


function jobTierLabel(tier: number): string {
  const b = JOB_TIER_BENEFITS[tier] ?? JOB_TIER_BENEFITS[0]
  if (tier === 0) return 'No bonuses'
  const parts: string[] = []
  if (b.xpBonus > 0) parts.push(`+${b.xpBonus}% XP`)
  if (b.durationReduction > 0) parts.push(`-${b.durationReduction}% Dur`)
  if (b.yieldBonus > 0) parts.push(`+${b.yieldBonus} Yield`)
  return parts.join(', ')
}


const hasJobChanges = computed(() => Object.values(props.jobTiers).some((t) => t > 0))


const hasMachineChanges = computed(() => Object.values(props.machineLevels).some((l) => l > 0))


const hasFabricationChanges = computed(() =>
  Object.values(props.fabricationAllocations).some((p) => p > 0),
)


const hasAnyChanges = computed(
  () =>
    hasAnyStock() ||
    hasGardenChanges.value ||
    hasAwakenChanges.value ||
    hasJobChanges.value ||
    hasMachineChanges.value ||
    hasFabricationChanges.value,
)
</script>

<template>
  <section class="surface-card overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3">
      <button
        class="focus-ring flex items-center gap-2 text-left transition hover:bg-muted/20"
        @click="isOpen = !isOpen"
      >
        <component
          :is="isOpen ? ChevronDown : ChevronRight"
          class="size-4 shrink-0 text-muted-foreground"
        />
        <h3 class="text-sm font-bold tracking-wide text-foreground">Planner Settings</h3>
      </button>
      <button
        v-if="hasAnyChanges"
        class="focus-ring inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-red-400/35 hover:text-red-400"
        @click="emit('reset-all')"
      >
        <RotateCcw class="size-3" />
        Reset All
      </button>
    </div>

    <div v-if="isOpen" class="border-t border-border/40">
      <!-- Callout -->
      <div class="mx-4 mt-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          Settings are loaded from
          <RouterLink to="/configs" class="font-semibold text-primary hover:underline"
            >/configs</RouterLink
          >. Changes here are temporary for simulation and will not persist on refresh.
        </p>
      </div>

      <!-- Inventory Section -->
      <div class="px-4 py-3">
        <div class="flex items-center justify-between">
          <button
            class="focus-ring flex items-center gap-1.5 text-left"
            @click="inventoryOpen = !inventoryOpen"
          >
            <component
              :is="inventoryOpen ? ChevronDown : ChevronRight"
              class="size-3.5 shrink-0 text-muted-foreground"
            />
            <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Inventory
            </h4>
          </button>
          <button
            v-if="hasAnyStock()"
            class="focus-ring inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
            @click="emit('reset-inventory')"
          >
            <RotateCcw class="size-3" />
            Reset
          </button>
        </div>

        <p class="mt-1 text-xs text-muted-foreground/60">
          Set how many of each material you already own to subtract from the tree.
        </p>

        <div
          v-if="inventoryOpen"
          class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5"
        >
          <label
            v-for="item in treeItems"
            :key="item.itemId"
            class="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition"
            :class="
              (inventoryAmounts[item.itemId] ?? 0) > 0
                ? 'border-emerald-700/50 bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/5'
                : 'border-border/40 bg-background/30'
            "
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70"
            >
              <img
                v-if="getItemImage({ id: item.itemId })"
                :src="getItemImage({ id: item.itemId })"
                :alt="item.itemName"
                class="size-6 object-contain"
                loading="lazy"
              />
              <span v-else class="text-[10px] font-bold text-muted-foreground">{{
                item.itemName.charAt(0)
              }}</span>
            </div>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{{
              item.itemName
            }}</span>
            <input
              type="number"
              min="0"
              inputmode="numeric"
              :value="inventoryAmounts[item.itemId] ?? 0"
              class="focus-ring h-8 w-20 shrink-0 rounded-lg border bg-background/80 px-2 text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              :class="
                (inventoryAmounts[item.itemId] ?? 0) > 0
                  ? 'border-emerald-700/60 dark:border-emerald-400/40'
                  : 'border-border/70'
              "
              @change="applyInventory(item.itemId, $event)"
              @blur="applyInventory(item.itemId, $event)"
            />
          </label>
        </div>
      </div>

      <!-- Garden Section -->
      <div class="border-t border-border/40 px-4 py-3">
        <div class="flex items-center justify-between">
          <button
            class="focus-ring flex items-center gap-1.5 text-left"
            @click="gardenOpen = !gardenOpen"
          >
            <component
              :is="gardenOpen ? ChevronDown : ChevronRight"
              class="size-3.5 shrink-0 text-muted-foreground"
            />
            <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Garden
            </h4>
          </button>
          <div class="flex items-center gap-2">
            <span
              class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            >
              {{ remainingSlots }} slots left
            </span>
            <button
              v-if="hasGardenChanges"
              class="focus-ring inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
              @click="emit('reset-garden')"
            >
              <RotateCcw class="size-3" />
              Reset
            </button>
          </div>
        </div>

        <p class="mt-1 text-xs text-muted-foreground/60">
          Configure your garden flower layout to calculate essence gathering times.
        </p>

        <div v-if="gardenOpen" class="mt-3 space-y-3">
          <div
            v-for="flower in flowerTypes"
            :key="flower.id"
            class="rounded-xl border border-border/40 bg-background/30 px-3 py-2.5"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70"
              >
                <img
                  v-if="getItemImage({ id: flower.id })"
                  :src="getItemImage({ id: flower.id })"
                  :alt="flower.name"
                  class="size-5 object-contain"
                  loading="lazy"
                />
                <span v-else class="text-[10px] font-bold text-muted-foreground">{{
                  flower.name.charAt(0)
                }}</span>
              </div>
              <span class="min-w-0 flex-1 text-sm font-semibold text-foreground">{{
                flower.name
              }}</span>
              <span class="text-[10px] font-semibold text-muted-foreground"
                >{{ flowerCount(flower.id) }} flower{{
                  flowerCount(flower.id) === 1 ? '' : 's'
                }}</span
              >
              <span
                class="w-14 text-right text-xs font-semibold"
                :style="{ color: flowerYield(flower.id) > 0 ? 'var(--color-green)' : '' }"
              >
                {{ flowerYield(flower.id) }}/min
              </span>
            </div>

            <div class="mt-2 grid grid-cols-6 gap-1.5">
              <div v-for="lv in levels" :key="lv" class="flex flex-col items-center gap-1">
                <span class="text-[10px] font-bold text-muted-foreground">Lv{{ lv }}</span>
                <div
                  class="inline-flex items-center overflow-hidden rounded-lg border"
                  :class="
                    countAtLevel(flower.id, lv) > 0 ? 'border-primary/40' : 'border-border/70'
                  "
                >
                  <button
                    class="focus-ring flex h-7 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                    :disabled="countAtLevel(flower.id, lv) <= 0"
                    @click="stepCountAtLevel(flower.id, lv, -1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    inputmode="numeric"
                    :value="countAtLevel(flower.id, lv)"
                    class="focus-ring h-7 w-8 border-x bg-background/80 px-0.5 text-center text-xs font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    :class="
                      countAtLevel(flower.id, lv) > 0 ? 'border-primary/30' : 'border-border/50'
                    "
                    @change="setCountAtLevel(flower.id, lv, $event)"
                    @blur="setCountAtLevel(flower.id, lv, $event)"
                  />
                  <button
                    class="focus-ring flex h-7 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                    :disabled="remainingSlots <= 0 && countAtLevel(flower.id, lv) === 0"
                    @click="stepCountAtLevel(flower.id, lv, 1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Awaken Tree Section -->
      <div class="border-t border-border/40 px-4 py-3">
        <div class="flex items-center justify-between">
          <button
            class="focus-ring flex items-center gap-1.5 text-left"
            @click="awakenOpen = !awakenOpen"
          >
            <component
              :is="awakenOpen ? ChevronDown : ChevronRight"
              class="size-3.5 shrink-0 text-muted-foreground"
            />
            <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Awaken Tree
            </h4>
          </button>
          <button
            v-if="hasAwakenChanges"
            class="focus-ring inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
            @click="emit('reset-awaken')"
          >
            <RotateCcw class="size-3" />
            Reset
          </button>
        </div>

        <p class="mt-1 text-xs text-muted-foreground/60">
          Set your awaken tree upgrades for gathering yield bonuses and workstation speed.
        </p>

        <div v-if="awakenOpen" class="mt-3 space-y-3">
          <!-- Gathering upgrades (per job) -->
          <div class="space-y-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Gathering
            </p>
            <div
              v-for="job in gatherJobs"
              :key="job"
              class="rounded-xl border border-border/40 bg-background/30 px-3 py-2.5"
            >
              <div class="flex items-center gap-3">
                <img
                  v-if="sourceIcons[job]"
                  :src="sourceIcons[job]"
                  alt=""
                  class="size-4 shrink-0"
                  loading="lazy"
                />
                <span class="min-w-0 flex-1 text-xs font-semibold text-foreground">{{ job }}</span>

                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold text-muted-foreground">Yield</span>
                  <div class="flex items-center gap-1">
                    <button
                      v-for="yb in 3"
                      :key="yb - 1"
                      class="focus-ring h-6 rounded-md border px-2 text-[10px] font-bold transition"
                      :class="
                        (awakenGatherUpgrades[job]?.yieldBonus ?? 0) === yb - 1
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : 'border-border/50 bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      "
                      @click="emit('set-awaken-gather-yield-bonus', job, yb - 1)"
                    >
                      {{ yieldLabels[yb - 1] }}
                    </button>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold text-muted-foreground">Duration</span>
                  <div class="flex items-center gap-1">
                    <button
                      v-for="t in 5"
                      :key="t - 1"
                      class="focus-ring h-6 w-6 rounded-md border text-[10px] font-bold transition"
                      :class="
                        (awakenGatherUpgrades[job]?.durationTier ?? 0) === t - 1
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : 'border-border/50 bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      "
                      @click="emit('set-awaken-gather-duration-tier', job, t - 1)"
                    >
                      {{ t - 1 }}
                    </button>
                  </div>
                  <span
                    class="w-10 text-right text-[10px] font-semibold"
                    :style="{
                      color:
                        (awakenGatherUpgrades[job]?.durationTier ?? 0) > 0
                          ? 'var(--color-green)'
                          : '',
                    }"
                  >
                    {{ tierLabel(awakenGatherUpgrades[job]?.durationTier ?? 0, 5) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Workstation speed upgrades -->
          <div class="space-y-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workstations
            </p>
            <div
              v-for="ws in workstations"
              :key="ws"
              class="rounded-xl border border-border/40 bg-background/30 px-3 py-2.5"
            >
              <div class="flex items-center gap-3">
                <img
                  v-if="sourceIcons[ws]"
                  :src="sourceIcons[ws]"
                  alt=""
                  class="size-4 shrink-0"
                  loading="lazy"
                />
                <span class="min-w-0 flex-1 text-xs font-semibold text-foreground">{{ ws }}</span>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold text-muted-foreground">Speed</span>
                  <div class="flex items-center gap-1">
                    <button
                      v-for="t in 5"
                      :key="t - 1"
                      class="focus-ring h-6 w-6 rounded-md border text-[10px] font-bold transition"
                      :class="
                        (awakenSpeedTiers[ws] ?? 0) === t - 1
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : 'border-border/50 bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      "
                      @click="emit('set-awaken-speed-tier', ws, t - 1)"
                    >
                      {{ t - 1 }}
                    </button>
                  </div>
                  <span
                    class="w-10 text-right text-[10px] font-semibold"
                    :style="{ color: (awakenSpeedTiers[ws] ?? 0) > 0 ? 'var(--color-green)' : '' }"
                  >
                    {{ speedTierLabel(awakenSpeedTiers[ws] ?? 0, 10) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Job Tiers (temporary simulation) -->
      <div class="border-t border-border/40 px-4 py-3">
        <div class="flex items-center justify-between">
          <button
            class="focus-ring -mx-1 flex items-center gap-2 rounded-lg px-1 text-left transition hover:bg-muted/15"
            @click="jobTiersOpen = !jobTiersOpen"
          >
            <component
              :is="jobTiersOpen ? ChevronDown : ChevronRight"
              class="size-4 text-muted-foreground"
            />
            <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Job Tiers
            </h4>
            <span v-if="hasJobChanges" class="size-1.5 rounded-full bg-primary" />
          </button>
          <button
            v-if="hasJobChanges"
            class="focus-ring rounded-md p-1 text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
            title="Reset to sanctuary defaults"
            @click="emit('reset-job-tiers')"
          >
            <RotateCcw class="size-3" />
          </button>
        </div>

        <p class="mt-1 text-[10px] text-muted-foreground">
          Derived from sanctuary. Override here for simulation only (not saved).
        </p>

        <div v-if="jobTiersOpen" class="mt-3 space-y-2">
          <div
            v-for="job in jobs"
            :key="job"
            class="flex items-center justify-between rounded-lg px-2 py-1.5"
          >
            <div class="flex items-center gap-2">
              <img
                v-if="sourceIcons[job]"
                :src="sourceIcons[job]"
                alt=""
                class="size-4 shrink-0"
                loading="lazy"
              />
              <span class="text-sm text-foreground">{{ job }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span
                v-for="t in 6"
                :key="t - 1"
                class="cursor-pointer rounded-md border px-2 py-0.5 text-[10px] font-semibold transition"
                :class="
                  (jobTiers[job] ?? 0) === t - 1
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                "
                @click="emit('set-job-tier', job, t - 1)"
              >
                {{ t - 1 }}
              </span>
            </div>
          </div>
          <div class="space-y-0.5 px-2 text-[10px] text-muted-foreground">
            <div v-for="(_b, i) in JOB_TIER_BENEFITS.slice(1)" :key="i" class="flex gap-2">
              <span class="w-8 font-semibold">T{{ i + 1 }}:</span>
              <span>{{ jobTierLabel(i + 1) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Machine Levels -->
      <div class="border-t border-border/40 px-4 py-3">
        <div class="flex items-center justify-between">
          <button
            class="focus-ring -mx-1 flex items-center gap-2 rounded-lg px-1 text-left transition hover:bg-muted/15"
            @click="machinesOpen = !machinesOpen"
          >
            <component
              :is="machinesOpen ? ChevronDown : ChevronRight"
              class="size-4 text-muted-foreground"
            />
            <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Machine Levels
            </h4>
            <span v-if="hasMachineChanges" class="size-1.5 rounded-full bg-primary" />
          </button>
          <button
            v-if="hasMachineChanges"
            class="focus-ring rounded-md p-1 text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
            title="Reset machine levels"
            @click="emit('reset-machine-levels')"
          >
            <RotateCcw class="size-3" />
          </button>
        </div>

        <p class="mt-1 text-[10px] text-muted-foreground">
          Machine levels affect processing speed in planner time calculations.
        </p>

        <div v-if="machinesOpen" class="mt-3 space-y-2">
          <div
            v-for="machine in machines"
            :key="machine.id"
            class="flex items-center justify-between rounded-lg px-2 py-1.5"
          >
            <div class="flex items-center gap-2">
              <img
                v-if="getMachineImage(machine)"
                :src="getMachineImage(machine)"
                alt=""
                class="size-4 shrink-0"
              />
              <span class="text-sm text-foreground">{{ machine.name }}</span>
            </div>
            <div class="flex items-center gap-1">
              <div
                class="inline-flex items-center overflow-hidden rounded-lg border"
                :class="
                  (machineLevels[machine.id] ?? 0) > 0 ? 'border-primary/40' : 'border-border/70'
                "
              >
                <button
                  class="focus-ring flex h-7 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                  :disabled="(machineLevels[machine.id] ?? 0) <= 0"
                  @click="
                    emit('set-machine-level', machine.id, (machineLevels[machine.id] ?? 0) - 1)
                  "
                >
                  -
                </button>
                <span
                  class="flex h-7 w-8 items-center justify-center border-x text-xs font-semibold"
                  :class="
                    (machineLevels[machine.id] ?? 0) > 0
                      ? 'border-primary/30 text-primary'
                      : 'border-border/50 text-muted-foreground'
                  "
                >
                  {{ machineLevels[machine.id] ?? 0 }}
                </span>
                <button
                  class="focus-ring flex h-7 w-6 items-center justify-center text-[11px] font-bold text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                  :disabled="(machineLevels[machine.id] ?? 0) >= 10"
                  @click="
                    emit('set-machine-level', machine.id, (machineLevels[machine.id] ?? 0) + 1)
                  "
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fabrication Allocations -->
      <div class="border-t border-border/40 px-4 py-3">
        <div class="flex items-center justify-between">
          <button
            class="focus-ring -mx-1 flex items-center gap-2 rounded-lg px-1 text-left transition hover:bg-muted/15"
            @click="fabricationOpen = !fabricationOpen"
          >
            <component
              :is="fabricationOpen ? ChevronDown : ChevronRight"
              class="size-4 text-muted-foreground"
            />
            <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Fabrication
            </h4>
            <span v-if="hasFabricationChanges" class="size-1.5 rounded-full bg-primary" />
          </button>
          <button
            v-if="hasFabricationChanges"
            class="focus-ring rounded-md p-1 text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
            title="Reset fabrication"
            @click="emit('reset-fabrication')"
          >
            <RotateCcw class="size-3" />
          </button>
        </div>

        <p class="mt-1 text-[10px] text-muted-foreground">
          Fabrication points generate items passively (each point = 20 items/hr). Loaded from
          <RouterLink to="/configs" class="font-semibold text-primary hover:underline"
            >/configs</RouterLink
          >.
        </p>

        <div v-if="fabricationOpen" class="mt-3 space-y-2">
          <template v-if="Object.keys(fabricationAllocations).length > 0">
            <div
              v-for="(points, itemId) in fabricationAllocations"
              :key="itemId"
              class="flex items-center justify-between rounded-lg border px-2 py-1.5"
              :class="{
                'border-amber-500/40 bg-amber-500/5':
                  getFabItemState(String(itemId)) === 'simulated',
                'border-red-500/40 bg-red-500/5': getFabItemState(String(itemId)) === 'removed',
                'border-transparent': getFabItemState(String(itemId)) === 'save',
              }"
            >
              <div class="flex items-center gap-2">
                <img
                  v-if="getItemImage({ id: String(itemId) })"
                  :src="getItemImage({ id: String(itemId) })"
                  alt=""
                  class="size-4 shrink-0"
                />
                <span class="text-sm text-foreground">{{ itemName(String(itemId)) }}</span>
                <span
                  v-if="getFabItemState(String(itemId)) === 'simulated'"
                  class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400"
                >
                  simulated
                </span>
                <span
                  v-else-if="getFabItemState(String(itemId)) === 'removed'"
                  class="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 dark:text-red-400"
                >
                  reduced
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="text-[10px] font-semibold"
                  :class="{
                    'text-amber-600 dark:text-amber-400':
                      getFabItemState(String(itemId)) === 'simulated',
                    'text-red-600 dark:text-red-400': getFabItemState(String(itemId)) === 'removed',
                    'text-muted-foreground': getFabItemState(String(itemId)) === 'save',
                  }"
                >
                  {{ points * 20 }}/hr
                </span>
                <span
                  class="text-[10px] font-semibold"
                  :class="{
                    'text-amber-600 dark:text-amber-400':
                      getFabItemState(String(itemId)) === 'simulated',
                    'text-red-600 dark:text-red-400': getFabItemState(String(itemId)) === 'removed',
                    'color: var(--color-green)':
                      getFabItemState(String(itemId)) === 'save' && points > 0,
                  }"
                  :style="
                    getFabItemState(String(itemId)) === 'save' && points > 0
                      ? { color: 'var(--color-green)' }
                      : {}
                  "
                >
                  {{ points }} pts
                </span>
              </div>
            </div>
          </template>
          <p v-else class="text-[10px] text-muted-foreground/60">
            No fabrication allocations. Import a save file or configure in
            <RouterLink to="/fabrication" class="font-semibold text-primary hover:underline"
              >/fabrication</RouterLink
            >.
          </p>
        </div>
      </div>

      <!-- Expedition Party (still placeholder) -->
      <div class="border-t border-border/40 px-4 py-3">
        <div class="flex items-center justify-between">
          <h4 class="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
            Expedition Party
          </h4>
          <span
            class="rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground/60"
            >Coming Soon</span
          >
        </div>
        <p class="mt-1 text-xs text-muted-foreground/60">
          Party composition will affect expedition duration and reward amounts.
        </p>
      </div>
    </div>
  </section>
</template>
