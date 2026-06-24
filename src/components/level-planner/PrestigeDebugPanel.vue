<script setup lang="ts">
import { Bug, Check, Copy, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PrestigeLoopInput, PrestigeLoopPlan } from '@/utils/planner/prestigeLoopPlanner'
import { expeditionMap } from '@/utils/save/precomputedTables'

const props = defineProps<{
  open: boolean
  input: PrestigeLoopInput | null
  plan: PrestigeLoopPlan | null
}>()


const emit = defineEmits<{ close: [] }>()


type Tab = 'diagnostics' | 'input' | 'plan'
const activeTab = ref<Tab>('diagnostics')


function expeditionName(id: string): string {
  return expeditionMap.get(id)?.name ?? id
}


// Anchors (and total boosters) per expedition in the recommended setup — flags the
// "two anchors in one party" case for inspection.
const anchorsPerExpedition = computed(() => {
  if (!props.plan) return []
  return props.plan.assignment
    .map((a) => {
      const anchors = a.members.filter((m) => m.role === 'anchor').length
      const boosters = a.members.filter((m) => m.role === 'booster').length
      return {
        id: a.expeditionId,
        name: expeditionName(a.expeditionId),
        anchors,
        boosters,
        size: a.members.length,
      }
    })
    .toSorted((x, y) => y.anchors - x.anchors || y.boosters - x.boosters)
})


// How much the per-creature expedition assignment changes between consecutive timeline
// check-ins (quantifies the re-allocation / swapping the current model does).
const churn = computed(() => {
  if (!props.plan) return []
  const steps = props.plan.timeline
  const rows: { from: number; to: number; moved: number; total: number }[] = []
  const place = (i: number) => {
    const map = new Map<string, string>()
    for (const a of steps[i].assignment)
      for (const m of a.members) map.set(m.creatureId, a.expeditionId)
    return map
  }
  for (let i = 1; i < steps.length; i++) {
    const prev = place(i - 1)
    const cur = place(i)
    let moved = 0
    let total = 0
    for (const [id, exp] of cur) {
      total++
      const before = prev.get(id)
      if (before !== undefined && before !== exp) moved++
    }
    rows.push({ from: steps[i - 1].checkInIndex + 1, to: steps[i].checkInIndex + 1, moved, total })
  }
  return rows
})


const flaggedExpeditions = computed(() => anchorsPerExpedition.value.filter((e) => e.anchors >= 2))


const inputJson = computed(() => (props.input ? JSON.stringify(props.input, null, 2) : ''))
const planJson = computed(() => (props.plan ? JSON.stringify(props.plan, null, 2) : ''))
const bundleJson = computed(() => JSON.stringify({ input: props.input, plan: props.plan }, null, 2))


const copied = ref<string | null>(null)
function copy(text: string, key: string) {
  navigator.clipboard.writeText(text).then(() => {
    copied.value = key
    setTimeout(() => (copied.value = null), 2000)
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide">
      <div
        v-if="open"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-border bg-card shadow-2xl"
      >
        <!-- Header -->
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <Bug class="size-4 text-warning-strong" />
          <span class="text-sm font-bold uppercase tracking-wider text-warning-strong">
            Prestige Debug
          </span>
          <button
            class="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            @click="copy(bundleJson, 'bundle')"
          >
            <Check v-if="copied === 'bundle'" class="size-3 text-success-strong" />
            <Copy v-else class="size-3" />
            {{ copied === 'bundle' ? 'Copied!' : 'Copy input + plan' }}
          </button>
          <button
            class="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-border/40">
          <button
            v-for="tab in ['diagnostics', 'input', 'plan'] as Tab[]"
            :key="tab"
            class="flex-1 px-4 py-2 text-xs font-medium capitalize transition"
            :class="
              activeTab === tab
                ? 'border-b-2 border-warning text-warning-strong'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>

        <!-- Diagnostics -->
        <div v-if="activeTab === 'diagnostics'" class="flex-1 space-y-4 overflow-y-auto p-4">
          <p v-if="!plan" class="text-center text-xs text-muted-foreground/50">No plan computed.</p>
          <template v-else>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
                <p class="text-3xs uppercase tracking-wide text-muted-foreground">Loop</p>
                <p class="font-mono font-semibold">
                  K={{ plan.boosterCount }} · {{ plan.cadenceHours }}h
                </p>
              </div>
              <div class="rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
                <p class="text-3xs uppercase tracking-wide text-muted-foreground">Eligible</p>
                <p class="font-mono font-semibold">{{ plan.eligibleCount }}</p>
              </div>
              <div class="rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
                <p class="text-3xs uppercase tracking-wide text-muted-foreground">Tokens/hr</p>
                <p class="font-mono font-semibold">{{ plan.tokensPerHour.toFixed(3) }}</p>
              </div>
              <div class="rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
                <p class="text-3xs uppercase tracking-wide text-muted-foreground">Idle waste</p>
                <p class="font-mono font-semibold">
                  {{ (plan.idleWasteFraction * 100).toFixed(1) }}%
                </p>
              </div>
            </div>

            <!-- Two-anchor flag -->
            <div
              v-if="flaggedExpeditions.length"
              class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
            >
              <p class="font-semibold text-warning-strong">
                ⚠ {{ flaggedExpeditions.length }} expedition(s) with ≥2 anchors
              </p>
              <p v-for="e in flaggedExpeditions" :key="e.id" class="font-mono text-2xs">
                {{ e.name }}: {{ e.anchors }} anchors, {{ e.boosters }} boosters, party {{ e.size }}
              </p>
            </div>

            <div>
              <p class="mb-1 text-3xs font-bold uppercase tracking-wider text-muted-foreground/60">
                Boosters per expedition (setup)
              </p>
              <table class="w-full text-2xs">
                <tbody class="divide-y divide-border/20">
                  <tr v-for="e in anchorsPerExpedition" :key="e.id">
                    <td class="py-1 pr-2">{{ e.name }}</td>
                    <td
                      class="py-1 text-right font-mono"
                      :class="e.anchors >= 2 ? 'text-warning-strong' : ''"
                    >
                      {{ e.anchors }} anc
                    </td>
                    <td class="py-1 text-right font-mono text-muted-foreground">
                      {{ e.boosters }} boost
                    </td>
                    <td class="py-1 text-right font-mono text-muted-foreground/60">
                      /{{ e.size }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="churn.length">
              <p class="mb-1 text-3xs font-bold uppercase tracking-wider text-muted-foreground/60">
                Re-allocation churn (creatures moved between expeditions, per check-in)
              </p>
              <table class="w-full text-2xs">
                <tbody class="divide-y divide-border/20">
                  <tr v-for="c in churn" :key="c.to">
                    <td class="py-1">check-in {{ c.from }} → {{ c.to }}</td>
                    <td
                      class="py-1 text-right font-mono"
                      :class="c.moved > 0 ? 'text-info-strong' : 'text-muted-foreground/40'"
                    >
                      {{ c.moved }} / {{ c.total }} moved
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <!-- Input JSON -->
        <div v-else-if="activeTab === 'input'" class="flex flex-1 flex-col overflow-hidden">
          <div class="flex justify-end border-b border-border/40 px-4 py-2">
            <button
              class="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              @click="copy(inputJson, 'input')"
            >
              <Check v-if="copied === 'input'" class="size-3 text-success-strong" />
              <Copy v-else class="size-3" />
              {{ copied === 'input' ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <pre
            class="flex-1 overflow-auto p-4 font-mono text-2xs leading-relaxed text-foreground"
            >{{ inputJson || 'No input.' }}</pre
          >
        </div>

        <!-- Plan JSON -->
        <div v-else class="flex flex-1 flex-col overflow-hidden">
          <div class="flex justify-end border-b border-border/40 px-4 py-2">
            <button
              class="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-2xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              @click="copy(planJson, 'plan')"
            >
              <Check v-if="copied === 'plan'" class="size-3 text-success-strong" />
              <Copy v-else class="size-3" />
              {{ copied === 'plan' ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <pre
            class="flex-1 overflow-auto p-4 font-mono text-2xs leading-relaxed text-foreground"
            >{{ planJson || 'No plan.' }}</pre
          >
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
