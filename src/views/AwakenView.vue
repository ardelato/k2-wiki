<script setup lang="ts">
import { Coins, Sparkles } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useAwakenSimulation } from '@/composables/useAwakenSimulation'
import { useGameConfig } from '@/composables/useGameConfig'
import UpgradesContent from '@/data/upgrades'
import type { Upgrade, UpgradeEffectData } from '@/data/upgrades'
import { formatNumber } from '@/utils/format/format'
import { jobIcons, sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


const awakenPointImage = getItemImage({ id: 'awaken-points' })


type TabId = 'gathering' | 'workstations' | 'gold'


type ColorKey =
  | 'leaf'
  | 'silver'
  | 'copper'
  | 'jade'
  | 'coral'
  | 'amber'
  | 'gold'
  | 'rose'
  | 'violet'


type SkillGroup = {
  id: string
  label: string
  color: ColorKey
  prefix: string
  /** Image source for the card header icon; falls back to a Coins glyph if absent. */
  iconUrl?: string
}


const GATHER_GROUPS: SkillGroup[] = [
  {
    id: 'chopping',
    label: 'Chopping',
    color: 'leaf',
    prefix: 'chopping-',
    iconUrl: jobIcons.chopping,
  },
  { id: 'mining', label: 'Mining', color: 'silver', prefix: 'mining-', iconUrl: jobIcons.mining },
  {
    id: 'digging',
    label: 'Digging',
    color: 'copper',
    prefix: 'digging-',
    iconUrl: jobIcons.digging,
  },
  {
    id: 'exploring',
    label: 'Exploring',
    color: 'jade',
    prefix: 'exploring-',
    iconUrl: jobIcons.exploring,
  },
  {
    id: 'fishing',
    label: 'Fishing',
    color: 'coral',
    prefix: 'fishing-',
    iconUrl: jobIcons.fishing,
  },
  { id: 'farming', label: 'Farming', color: 'leaf', prefix: 'farming-', iconUrl: jobIcons.farming },
]


const WORK_GROUPS: SkillGroup[] = [
  {
    id: 'furnace',
    label: 'Furnace',
    color: 'coral',
    prefix: 'furnace-',
    iconUrl: sourceIcons.Furnace,
  },
  { id: 'stove', label: 'Stove', color: 'amber', prefix: 'stove-', iconUrl: sourceIcons.Stove },
  {
    id: 'workbench',
    label: 'Workbench',
    color: 'silver',
    prefix: 'workbench-',
    iconUrl: sourceIcons.Workbench,
  },
]


const GOLD_GROUPS: SkillGroup[] = [
  {
    id: 'awaken-gold',
    label: 'Awaken Gold',
    color: 'gold',
    prefix: 'awaken-gold-',
    iconUrl: getItemImage({ id: 'gold' }),
  },
  {
    id: 'merchant-discount',
    label: 'Merchant Discount',
    color: 'violet',
    prefix: 'merchant-discount-',
    iconUrl: getItemImage({ id: 'gold' }),
  },
  {
    id: 'sellable-gold',
    label: 'Sellable Bonus',
    color: 'rose',
    prefix: 'sellable-gold-',
    iconUrl: getItemImage({ id: 'gold' }),
  },
]


const PALETTE: Record<ColorKey, { fill: string; stroke: string; line: string; bgTint: string }> = {
  leaf: {
    fill: 'oklch(0.65 0.20 145 / 0.72)',
    stroke: 'oklch(0.72 0.20 145)',
    line: 'oklch(0.70 0.20 145 / 0.55)',
    bgTint: 'oklch(0.65 0.20 145 / 0.05)',
  },
  silver: {
    fill: 'oklch(0.74 0.02 240 / 0.62)',
    stroke: 'oklch(0.82 0.02 240)',
    line: 'oklch(0.80 0.02 240 / 0.55)',
    bgTint: 'oklch(0.74 0.02 240 / 0.05)',
  },
  copper: {
    fill: 'oklch(0.65 0.15 55 / 0.72)',
    stroke: 'oklch(0.72 0.15 55)',
    line: 'oklch(0.72 0.15 55 / 0.55)',
    bgTint: 'oklch(0.65 0.15 55 / 0.05)',
  },
  jade: {
    fill: 'oklch(0.65 0.13 175 / 0.72)',
    stroke: 'oklch(0.72 0.13 175)',
    line: 'oklch(0.72 0.13 175 / 0.55)',
    bgTint: 'oklch(0.65 0.13 175 / 0.05)',
  },
  coral: {
    fill: 'oklch(0.68 0.18 25 / 0.72)',
    stroke: 'oklch(0.74 0.18 25)',
    line: 'oklch(0.74 0.18 25 / 0.55)',
    bgTint: 'oklch(0.68 0.18 25 / 0.05)',
  },
  amber: {
    fill: 'oklch(0.78 0.16 75 / 0.72)',
    stroke: 'oklch(0.82 0.16 75)',
    line: 'oklch(0.82 0.16 75 / 0.55)',
    bgTint: 'oklch(0.78 0.16 75 / 0.05)',
  },
  gold: {
    fill: 'oklch(0.82 0.16 90 / 0.78)',
    stroke: 'oklch(0.86 0.16 90)',
    line: 'oklch(0.86 0.16 90 / 0.6)',
    bgTint: 'oklch(0.82 0.16 90 / 0.06)',
  },
  rose: {
    fill: 'oklch(0.70 0.18 350 / 0.72)',
    stroke: 'oklch(0.76 0.18 350)',
    line: 'oklch(0.76 0.18 350 / 0.55)',
    bgTint: 'oklch(0.70 0.18 350 / 0.05)',
  },
  violet: {
    fill: 'oklch(0.66 0.17 295 / 0.72)',
    stroke: 'oklch(0.74 0.17 295)',
    line: 'oklch(0.74 0.17 295 / 0.55)',
    bgTint: 'oklch(0.66 0.17 295 / 0.05)',
  },
}


const SIM_STROKE = 'oklch(0.84 0.17 75)'
const REM_STROKE = 'oklch(0.62 0.22 25)'


// "Gold" is a frozen game currency term and stays English in every locale.
function tabLabel(id: TabId): string {
  if (id === 'gold') return 'Gold'
  return t(`awakenView.tabs.${id}`)
}


const tab = ref<TabId>('gathering')


// Deep-link highlight: a planner advisory can open ?tree=<skill>&node=<id> to flag
// the relevant tree card + node for a few seconds.
const route = useRoute()
const highlightTree = ref<string | null>(null)
const highlightNode = ref<string | null>(null)


function tabForTree(id: string): TabId {
  if (WORK_GROUPS.some((g) => g.id === id)) return 'workstations'
  if (GOLD_GROUPS.some((g) => g.id === id)) return 'gold'
  return 'gathering'
}


onMounted(() => {
  const tree = typeof route.query.tree === 'string' ? route.query.tree : null
  if (!tree) return
  tab.value = tabForTree(tree)
  highlightTree.value = tree
  highlightNode.value = typeof route.query.node === 'string' ? route.query.node : null
  nextTick(() => {
    document
      .getElementById(`awaken-card-${tree}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  window.setTimeout(() => {
    highlightTree.value = null
    highlightNode.value = null
  }, 3500)
})


const { simAdded, simRemoved, savedIds, effectiveIds } = useAwakenSimulation()
const { inventoryAmounts } = useGameConfig()
const savedUnallocated = computed(() => inventoryAmounts.value['awaken-points'] ?? 0)


const simAddedSet = computed(() => new Set(simAdded.value))
const simRemovedSet = computed(() => new Set(simRemoved.value))


type NodeState = 'save' | 'simulated' | 'removed' | 'available' | 'locked'


const lookup = new Map<string, Upgrade>(UpgradesContent.get.map((u) => [u.id, u]))


// Reverse index: id → ids of upgrades that list it as a prerequisite.
const dependents = (() => {
  const map = new Map<string, string[]>()
  for (const u of UpgradesContent.get) {
    for (const p of u.prerequisites) {
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(u.id)
    }
  }
  return map
})()


function transitivePrereqs(id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.pop()!
    const u = lookup.get(cur)
    if (!u) continue
    for (const p of u.prerequisites) {
      if (!seen.has(p)) {
        seen.add(p)
        out.push(p)
        queue.push(p)
      }
    }
  }
  return out
}


function transitiveDependents(id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.pop()!
    for (const child of dependents.get(cur) ?? []) {
      if (!seen.has(child)) {
        seen.add(child)
        out.push(child)
        queue.push(child)
      }
    }
  }
  return out
}


function isPrereqMet(upgrade: Upgrade): boolean {
  if (upgrade.prerequisites.length === 0) return true
  for (const p of upgrade.prerequisites) if (!effectiveIds.value.has(p)) return false
  return true
}


function costToUnlock(upgrade: Upgrade): number {
  let total = effectiveIds.value.has(upgrade.id) ? 0 : upgrade.cost
  for (const id of transitivePrereqs(upgrade.id)) {
    if (effectiveIds.value.has(id)) continue
    const u = lookup.get(id)
    if (u) total += u.cost
  }
  return total
}


function nodeState(upgrade: Upgrade): NodeState {
  const owned = effectiveIds.value.has(upgrade.id)
  const inSave = savedIds.value.has(upgrade.id)
  if (owned) return inSave ? 'save' : 'simulated'
  if (inSave) return 'removed'
  return isPrereqMet(upgrade) ? 'available' : 'locked'
}


function isLit(state: NodeState): boolean {
  return state === 'save' || state === 'simulated'
}


/** Mark a set of upgrades as purchased, walking back through prerequisites. */
function bulkPurchase(ids: string[]) {
  const toAdd: string[] = []
  const toUnremove = new Set<string>()
  const seen = new Set<string>()
  const queue = [...ids]
  while (queue.length > 0) {
    const cur = queue.pop()!
    if (seen.has(cur)) continue
    seen.add(cur)
    if (effectiveIds.value.has(cur)) continue
    if (simRemovedSet.value.has(cur)) {
      toUnremove.add(cur)
    } else {
      toAdd.push(cur)
    }
    const u = lookup.get(cur)
    if (!u) continue
    for (const p of u.prerequisites) queue.push(p)
  }
  if (toUnremove.size > 0) {
    simRemoved.value = simRemoved.value.filter((id) => !toUnremove.has(id))
  }
  if (toAdd.length > 0) {
    const existing = new Set(simAdded.value)
    for (const id of toAdd) existing.add(id)
    simAdded.value = [...existing]
  }
}


/** Remove a set of upgrades and cascade to every owned dependent, plus
 * sweep upstream to drop sim'd prereqs that no longer have any owned
 * dependent justifying their presence. */
function bulkRemove(ids: string[]) {
  const targets = new Set<string>()
  // 1. Cascade downstream: pull in every owned dependent.
  for (const id of ids) {
    if (!effectiveIds.value.has(id)) continue
    targets.add(id)
    for (const dep of transitiveDependents(id)) {
      if (effectiveIds.value.has(dep)) targets.add(dep)
    }
  }
  if (targets.size === 0) return


  // 2. Sweep upstream: a sim'd prereq added only to satisfy something
  // in targets should also be removed if nothing else owned still needs it.
  const stillOwned = new Set<string>()
  for (const id of effectiveIds.value) if (!targets.has(id)) stillOwned.add(id)
  const upstream: string[] = []
  for (const id of targets) {
    const u = lookup.get(id)
    if (u) for (const p of u.prerequisites) upstream.push(p)
  }
  while (upstream.length > 0) {
    const cur = upstream.pop()!
    if (targets.has(cur)) continue
    if (!simAddedSet.value.has(cur)) continue
    if (savedIds.value.has(cur)) continue
    let hasOwnedDep = false
    for (const dep of dependents.get(cur) ?? []) {
      if (stillOwned.has(dep)) {
        hasOwnedDep = true
        break
      }
    }
    if (hasOwnedDep) continue
    targets.add(cur)
    stillOwned.delete(cur)
    const u = lookup.get(cur)
    if (u) for (const p of u.prerequisites) upstream.push(p)
  }


  // 3. Apply.
  const newSimAdded: string[] = []
  for (const id of simAdded.value) if (!targets.has(id)) newSimAdded.push(id)
  const removeFromSave: string[] = []
  for (const id of targets) if (savedIds.value.has(id)) removeFromSave.push(id)
  simAdded.value = newSimAdded
  if (removeFromSave.length > 0) {
    const existing = new Set(simRemoved.value)
    for (const id of removeFromSave) existing.add(id)
    simRemoved.value = [...existing]
  }
}


function clickNode(upgrade: Upgrade) {
  const state = nodeState(upgrade)
  if (state === 'save' || state === 'simulated') {
    bulkRemove([upgrade.id])
  } else if (state === 'removed' || state === 'available' || state === 'locked') {
    bulkPurchase([upgrade.id])
  }
}


// --- Per-skill card data --------------------------------------------------
type RowLabel = { y: number; kind: string; value: number }


type CardView = {
  group: SkillGroup
  upgrades: Upgrade[]
  edges: Array<{ from: Upgrade; to: Upgrade }>
  minX: number
  minY: number
  maxX: number
  mirrorX: boolean
  rows: RowLabel[]
  labelPad: number
  width: number
  height: number
  owned: number
  sim: number
  removed: number
}


const NODE_SIZE = 22
const GRID = 32
const LABEL_PAD = 64


// Effect-type ("kind") labels are wiki-derived from the upgrade id, not verbatim
// in-game text, so they are translated. Gold/XP stay English (frozen currency / universal).
const KIND_KEYS = new Set([
  'yield',
  'duration',
  'speed',
  'xp',
  'recovery',
  'discount',
  'bonus',
  'gold',
])
function kindLabel(kind: string): string {
  return KIND_KEYS.has(kind) ? t('awakenView.kinds.' + kind) : kind
}


// Descriptive group headers are translated (keeping the embedded game term English);
// game-vocab group labels (job/workstation names, Awaken Gold) fall back to their literal.
const GROUP_LABEL_KEY: Record<string, string> = {
  'merchant-discount': 'merchantDiscount',
  'sellable-gold': 'sellableBonus',
}
function groupLabel(group: SkillGroup): string {
  const key = GROUP_LABEL_KEY[group.id]
  return key ? t('awakenView.groups.' + key) : group.label
}


// Tooltip descriptions are regenerated from each upgrade's structured effectData
// so the text is localized AND locale-reactive (t() runs at render). The English
// `description` in upgrades.ts stays the data source / fallback. Job/workstation
// names, XP, Gold, Merchant, Shop and Awaken stay English (frozen game vocab);
// only Duration/Yield/Speed and the recovery/awaken-gold/merchant-cost phrases
// are translated.
function describeEffect(e: UpgradeEffectData): string {
  switch (e.type) {
    case 'skill_xp':
      return `${e.skill} +${e.value}% XP`
    case 'workstation_xp':
      return `${e.workstation} +${e.value}% XP`
    case 'skill_duration':
      return `${e.skill} -${Math.abs(e.value)}% ${t('awakenView.kinds.duration')}`
    case 'skill_yield':
      return `${e.skill} +${e.value} ${t('awakenView.kinds.yield')}`
    case 'workstation_speed':
      return `${e.workstation} +${e.value}% ${t('awakenView.kinds.speed')}`
    case 'workstation_recovery':
      return t('awakenView.effects.recovery', { value: e.value })
    case 'awaken_gold':
      return t('awakenView.effects.awakenGold', { value: e.value })
    case 'merchant_discount':
      return t('awakenView.effects.merchantCost', { value: e.value })
    case 'sellable_gold_bonus':
      return `Merchant +${e.value}% Gold`
  }
}


function upgradeKind(id: string): string {
  const parts = id.split('-')
  if (parts.length > 0 && /^[ivxlcdm]+$/i.test(parts[parts.length - 1])) parts.pop()
  return parts[parts.length - 1] ?? ''
}


function computeRows(list: Upgrade[]): RowLabel[] {
  const counts = new Map<number, Map<string, number>>()
  for (const u of list) {
    const k = upgradeKind(u.id)
    const m = counts.get(u.y) ?? new Map<string, number>()
    m.set(k, (m.get(k) ?? 0) + 1)
    counts.set(u.y, m)
  }
  const rows: RowLabel[] = []
  for (const [y, m] of counts) {
    let bestK = ''
    let bestN = 0
    for (const [k, n] of m) {
      if (n > bestN) {
        bestN = n
        bestK = k
      }
    }
    rows.push({ y, kind: bestK, value: 0 })
  }
  if (rows.length === 0) return []
  // Single-kind cards collapse to one summary row anchored at the median y so
  // the label lands centered against the node row(s) rather than repeating.
  const distinct = new Set(rows.map((r) => r.kind))
  if (distinct.size === 1) {
    const sortedYs = rows.map((r) => r.y).toSorted((a, b) => a - b)
    const medianY = sortedYs[Math.floor(sortedYs.length / 2)]
    return [{ y: medianY, kind: rows[0].kind, value: 0 }]
  }
  return rows.toSorted((a, b) => a.y - b.y)
}


function rowEffectiveValue(
  list: Upgrade[],
  y: number,
  effective: Set<string>,
  spanAllRows: boolean,
): number {
  let total = 0
  for (const u of list) {
    if (!spanAllRows && u.y !== y) continue
    if (!effective.has(u.id)) continue
    const e = u.effectData as { value?: number }
    if (typeof e.value === 'number') total += e.value
  }
  return total
}


function formatRowValue(kind: string, value: number): string {
  if (value === 0) return ''
  if (kind === 'yield' || kind === 'gold') {
    return value < 0 ? `−${Math.abs(value)}` : `+${value}`
  }
  if (kind === 'discount') return `−${Math.abs(value)}%`
  if (value < 0) return `−${Math.abs(value)}%`
  return `+${value}%`
}


function buildCard(group: SkillGroup): CardView {
  const list = UpgradesContent.get.filter((u) => u.id.startsWith(group.prefix))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const u of list) {
    if (u.x < minX) minX = u.x
    if (u.x > maxX) maxX = u.x
    if (u.y < minY) minY = u.y
    if (u.y > maxY) maxY = u.y
  }
  const idSet = new Set(list.map((u) => u.id))
  const edges: Array<{ from: Upgrade; to: Upgrade }> = []
  for (const u of list) {
    for (const p of u.prerequisites) {
      if (!idSet.has(p)) continue
      const prereq = lookup.get(p)
      if (prereq) edges.push({ from: prereq, to: u })
    }
  }
  let owned = 0
  let sim = 0
  let removed = 0
  for (const u of list) {
    const s = nodeState(u)
    if (s === 'save' || s === 'simulated') owned++
    if (s === 'simulated') sim++
    if (s === 'removed') removed++
  }
  const rowsBase = computeRows(list)
  const spanAllRows = rowsBase.length === 1
  const rows: RowLabel[] = rowsBase.map((r) => ({
    ...r,
    value: rowEffectiveValue(list, r.y, effectiveIds.value, spanAllRows),
  }))
  const labelPad = rows.length > 0 ? LABEL_PAD : 0
  const width = labelPad + (maxX - minX) * GRID + NODE_SIZE + 16
  const height = (maxY - minY) * GRID + NODE_SIZE + 16
  // In-game some trees grow leftward from their root; flip them so every
  // wiki tree grows rightward (root anchored to the left edge).
  const roots = list.filter((u) => u.prerequisites.length === 0)
  const avgRootX =
    roots.length > 0 ? roots.reduce((s, u) => s + u.x, 0) / roots.length : (minX + maxX) / 2
  const mirrorX = avgRootX - minX > maxX - avgRootX
  return {
    group,
    upgrades: list,
    edges,
    minX,
    minY,
    maxX,
    mirrorX,
    rows,
    labelPad,
    width,
    height,
    owned,
    sim,
    removed,
  }
}


function cardPos(card: CardView, u: Upgrade): { cx: number; cy: number } {
  const xOffset = card.mirrorX ? card.maxX - u.x : u.x - card.minX
  return {
    cx: card.labelPad + xOffset * GRID + NODE_SIZE / 2 + 8,
    cy: (u.y - card.minY) * GRID + NODE_SIZE / 2 + 8,
  }
}


function rowLabelY(card: CardView, y: number): number {
  return (y - card.minY) * GRID + NODE_SIZE / 2 + 8
}


const cardsByTab = computed<Record<TabId, CardView[]>>(() => ({
  gathering: GATHER_GROUPS.map(buildCard),
  workstations: WORK_GROUPS.map(buildCard),
  gold: GOLD_GROUPS.map(buildCard),
}))


const activeCards = computed(() => cardsByTab.value[tab.value])


// --- Summary --------------------------------------------------------------
const totalSaved = computed(() => savedIds.value.size)
const totalSim = computed(() => {
  let n = 0
  for (const id of simAddedSet.value) if (!savedIds.value.has(id)) n++
  return n
})
const totalRemoved = computed(() => {
  let n = 0
  for (const id of simRemovedSet.value) if (savedIds.value.has(id)) n++
  return n
})
const totalUpgrades = UpgradesContent.get.length
const hasChanges = computed(() => totalSim.value > 0 || totalRemoved.value > 0)
const unallocatedPoints = computed(
  () => savedUnallocated.value + totalRemoved.value - totalSim.value,
)


function resetSimulation() {
  simAdded.value = []
  simRemoved.value = []
}


function tabCount(t: TabId) {
  let owned = 0
  let total = 0
  for (const c of cardsByTab.value[t]) {
    owned += c.owned
    total += c.upgrades.length
  }
  return `${owned}/${total}`
}


// Tooltip state
const hovered = ref<Upgrade | null>(null)
const hoverPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })


function onNodeMouseEnter(u: Upgrade, evt: MouseEvent) {
  hovered.value = u
  hoverPos.value = { x: evt.clientX, y: evt.clientY }
}
function onNodeMouseMove(evt: MouseEvent) {
  if (!hovered.value) return
  hoverPos.value = { x: evt.clientX, y: evt.clientY }
}
function onNodeMouseLeave() {
  hovered.value = null
}
</script>

<template>
  <div class="space-y-6" @mousemove="onNodeMouseMove">
    <div>
      <div class="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
        {{ t('awakenView.eyebrow') }}
      </div>
      <h1 class="mt-1 text-2xl font-bold">Awaken Tree</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t('awakenView.intro') }}
      </p>
    </div>

    <!-- Summary bar -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
    >
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5">
          <img
            v-if="awakenPointImage"
            :src="awakenPointImage"
            alt=""
            class="size-4"
            style="image-rendering: pixelated"
            loading="lazy"
          />
          <Sparkles v-else class="size-4 text-primary" />
          <span class="font-semibold">
            {{ t('awakenView.upgradesCount', { n: effectiveIds.size, total: totalUpgrades }) }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span
            v-if="totalSaved > 0"
            class="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary"
          >
            {{ totalSaved }} {{ t('awakenView.fromSave') }}
          </span>
          <span
            v-if="savedUnallocated > 0"
            :class="
              unallocatedPoints < 0
                ? 'rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger-strong'
                : 'rounded-full bg-muted px-2 py-0.5 font-medium text-foreground'
            "
            :title="
              unallocatedPoints < 0
                ? t('awakenView.unallocatedExceedTooltip', { n: Math.abs(unallocatedPoints) })
                : t('awakenView.unallocatedTooltip')
            "
          >
            {{ unallocatedPoints }} {{ t('awakenView.unallocated') }}
          </span>
          <span
            v-if="totalSim > 0"
            class="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning-strong"
          >
            +{{ totalSim }} {{ t('awakenView.simulated') }}
          </span>
          <span
            v-if="totalRemoved > 0"
            class="rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger-strong"
          >
            −{{ totalRemoved }} {{ t('awakenView.removed') }}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="rounded-full border border-border/60 bg-card/65 px-2.5 py-1 text-2xs font-semibold text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
          :class="hasChanges ? '' : 'pointer-events-none invisible'"
          :aria-hidden="!hasChanges"
          @click="resetSimulation"
        >
          {{ t('awakenView.reset') }}
        </button>
      </div>
    </div>

    <!-- Tab strip -->
    <div class="flex items-center gap-1 border-b border-border">
      <button
        v-for="t in ['gathering', 'workstations', 'gold'] as const"
        :key="t"
        class="-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition"
        :class="
          tab === t
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="tab = t"
      >
        {{ tabLabel(t) }}
        <span class="font-mono text-xs text-muted-foreground">({{ tabCount(t) }})</span>
      </button>
      <div class="ml-auto flex items-center gap-3 pb-2 font-mono text-3xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-block size-2.5 rounded-sm"
            style="box-shadow: inset 0 0 0 1.5px hsl(var(--primary))"
          />
          {{ t('awakenView.legendFromSave') }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="relative inline-block size-2.5 rounded-sm border border-muted-foreground/60">
            <span
              class="absolute -right-0.5 -top-0.5 inline-block size-1.5 rounded-full"
              style="background: oklch(0.84 0.17 75)"
            />
          </span>
          {{ t('awakenView.legendSimulated') }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-block size-2.5 rounded-sm border border-dashed"
            style="border-color: oklch(0.62 0.22 25)"
          />
          {{ t('awakenView.legendRemoved') }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="relative inline-block size-2.5 rounded-sm border border-foreground">
            <span
              class="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-foreground"
            />
          </span>
          {{ t('awakenView.legendAvailable') }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-block size-2.5 rounded-sm bg-muted" />
          {{ t('awakenView.legendLocked') }}
        </span>
      </div>
    </div>

    <!-- Skill cards grid -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="card in activeCards"
        :id="`awaken-card-${card.group.id}`"
        :key="card.group.id"
        class="rounded-xl border border-border bg-card p-3"
        :class="{ 'attn-ring': highlightTree === card.group.id }"
        :style="{ background: `linear-gradient(${PALETTE[card.group.color].bgTint}, transparent)` }"
      >
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <img
              v-if="card.group.iconUrl"
              :src="card.group.iconUrl"
              :alt="groupLabel(card.group)"
              class="size-5"
              style="image-rendering: pixelated"
              loading="lazy"
            />
            <Coins v-else class="size-5" :style="{ color: PALETTE[card.group.color].stroke }" />
            <span class="text-sm font-semibold">{{ groupLabel(card.group) }}</span>
          </div>
          <span class="font-mono text-3xs text-muted-foreground">
            {{ card.owned }}/{{ card.upgrades.length }}
            <span v-if="card.sim > 0" class="ml-0.5 text-warning-strong">+{{ card.sim }}</span>
            <span v-if="card.removed > 0" class="ml-0.5 text-danger-strong"
              >−{{ card.removed }}</span
            >
          </span>
        </div>
        <svg
          :viewBox="`0 0 ${card.width} ${card.height}`"
          :style="{ width: '100%', height: card.height + 'px', maxHeight: '160px' }"
          preserveAspectRatio="xMidYMid meet"
          class="text-border"
        >
          <!-- Row labels -->
          <text
            v-for="row in card.rows"
            :key="`rl-${card.group.id}-${row.y}`"
            x="2"
            :y="rowLabelY(card, row.y)"
            class="fill-muted-foreground/80"
            style="
              font-size: 8px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              font-family: ui-monospace, monospace;
            "
            dominant-baseline="middle"
          >
            {{ kindLabel(row.kind) }}
            <tspan v-if="row.value !== 0" class="fill-foreground" dx="3" style="font-weight: 600">
              {{ formatRowValue(row.kind, row.value) }}
            </tspan>
          </text>

          <!-- Edges -->
          <line
            v-for="(edge, ei) in card.edges"
            :key="`e-${card.group.id}-${ei}`"
            :x1="cardPos(card, edge.from).cx"
            :y1="cardPos(card, edge.from).cy"
            :x2="cardPos(card, edge.to).cx"
            :y2="cardPos(card, edge.to).cy"
            :stroke="
              isLit(nodeState(edge.from)) && isLit(nodeState(edge.to))
                ? PALETTE[card.group.color].line
                : 'currentColor'
            "
            :stroke-opacity="isLit(nodeState(edge.from)) && isLit(nodeState(edge.to)) ? 1 : 0.35"
            stroke-width="2"
            stroke-linecap="round"
          />
          <!-- Nodes -->
          <g
            v-for="u in card.upgrades"
            :key="u.id"
            class="cursor-pointer"
            @click="clickNode(u)"
            @mouseenter="onNodeMouseEnter(u, $event)"
            @mouseleave="onNodeMouseLeave"
          >
            <!-- Deep-link highlight ring -->
            <rect
              v-if="u.id === highlightNode"
              :x="cardPos(card, u).cx - NODE_SIZE / 2 - 2.5"
              :y="cardPos(card, u).cy - NODE_SIZE / 2 - 2.5"
              :width="NODE_SIZE + 5"
              :height="NODE_SIZE + 5"
              rx="4"
              fill="none"
              stroke="hsl(48 96% 53%)"
              class="attn-node"
              style="pointer-events: none"
            />
            <rect
              :x="cardPos(card, u).cx - NODE_SIZE / 2"
              :y="cardPos(card, u).cy - NODE_SIZE / 2"
              :width="NODE_SIZE"
              :height="NODE_SIZE"
              rx="3"
              :fill="
                nodeState(u) === 'save'
                  ? PALETTE[card.group.color].fill
                  : nodeState(u) === 'locked'
                    ? 'hsl(var(--muted) / 0.55)'
                    : 'transparent'
              "
              :stroke="
                nodeState(u) === 'save'
                  ? 'hsl(var(--primary))'
                  : nodeState(u) === 'simulated'
                    ? PALETTE[card.group.color].stroke
                    : nodeState(u) === 'removed'
                      ? REM_STROKE
                      : nodeState(u) === 'available'
                        ? 'hsl(var(--foreground))'
                        : 'hsl(var(--muted-foreground) / 0.25)'
              "
              :stroke-width="
                nodeState(u) === 'simulated'
                  ? 2.5
                  : isLit(nodeState(u))
                    ? 2
                    : nodeState(u) === 'available'
                      ? 1.75
                      : 1
              "
              :stroke-dasharray="nodeState(u) === 'removed' ? '3,2' : undefined"
            />
            <rect
              v-if="nodeState(u) !== 'locked'"
              :x="cardPos(card, u).cx - 3"
              :y="cardPos(card, u).cy - 3"
              width="6"
              height="6"
              rx="1"
              :fill="
                nodeState(u) === 'save'
                  ? 'rgba(255,255,255,0.6)'
                  : nodeState(u) === 'simulated'
                    ? SIM_STROKE
                    : nodeState(u) === 'available'
                      ? 'hsl(var(--foreground))'
                      : 'currentColor'
              "
              :opacity="
                nodeState(u) === 'save' ||
                nodeState(u) === 'simulated' ||
                nodeState(u) === 'available'
                  ? 1
                  : 0.45
              "
            />
            <circle
              v-if="nodeState(u) === 'simulated'"
              :cx="cardPos(card, u).cx + NODE_SIZE / 2 - 1"
              :cy="cardPos(card, u).cy - NODE_SIZE / 2 + 1"
              r="3"
              fill="oklch(0.84 0.17 75)"
              stroke="hsl(var(--card))"
              stroke-width="1.5"
            />
          </g>
        </svg>
      </div>
    </div>

    <!-- Tooltip -->
    <div
      v-if="hovered"
      class="pointer-events-none fixed z-50 max-w-xs rounded-md border border-border bg-card px-3 py-2 text-xs shadow-xl ring-1 ring-black/5 backdrop-blur-sm"
      :style="{ top: hoverPos.y + 14 + 'px', left: hoverPos.x + 14 + 'px' }"
    >
      <div class="font-semibold text-foreground">{{ hovered.name }}</div>
      <div class="mt-0.5 text-muted-foreground">{{ describeEffect(hovered.effectData) }}</div>
      <div class="mt-1 font-mono text-3xs">
        <span v-if="effectiveIds.has(hovered.id)" class="text-success-strong">{{
          t('awakenView.unlocked')
        }}</span>
        <span v-else class="inline-flex items-center gap-1">
          <span class="inline-flex items-center gap-1 text-warning-strong">
            <img
              v-if="awakenPointImage"
              :src="awakenPointImage"
              alt=""
              class="size-3"
              style="image-rendering: pixelated"
              loading="lazy"
            />
            {{ formatNumber(costToUnlock(hovered)) }}
          </span>
          <span v-if="!isPrereqMet(hovered)" class="text-muted-foreground">
            {{ t('awakenView.inclPrereqs') }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
