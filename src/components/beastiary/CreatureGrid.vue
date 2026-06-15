<script setup lang="ts">
import { Check, Minus, Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import awakenedSummonedIcon from '@/assets/icons/awakened_summoned.webp'
import notSummonedIcon from '@/assets/icons/not_summoned.webp'
import summonedIcon from '@/assets/icons/summoned.webp'
import { useCreatureCollection } from '@/composables/useCreatureCollection'
import type { Creature } from '@/types'
import { getCreatureImage } from '@/utils/creatureImages'
import { typeColor, typeColorVar } from '@/utils/format'
import { maxLevelForState } from '@/utils/formulas'

defineProps<{
  groups: { tier: number; creatures: Creature[] }[]
  editing: boolean
  selectedIds: Set<string>
  selectedCreatureId: string | null
}>()


const emit = defineEmits<{
  select: [creature: Creature]
  'toggle-selected': [id: string]
}>()


const { t } = useI18n()


const { isOwned, isAwakened, getLevel, setLevel, setAwakened, stepLevel, normalizeLevelOnBlur } =
  useCreatureCollection()
</script>

<template>
  <div class="space-y-6" :style="{ '--card-w': '220px' }">
    <div v-for="group in groups" :key="group.tier" class="space-y-3">
      <div class="flex items-center gap-3">
        <h2 class="shrink-0 text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {{ t('beastiary.grid.tierHeading', { tier: group.tier + 1 }) }}
          <span class="ml-1 text-xs font-normal">
            ({{ group.creatures.filter((c) => isOwned(c.id)).length }}/{{ group.creatures.length }})
          </span>
        </h2>
        <div class="h-px flex-1 bg-border/60" />
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,var(--card-w))] justify-evenly gap-8">
        <div
          v-for="creature in group.creatures"
          :key="creature.id"
          class="group relative w-[var(--card-w)] cursor-pointer rounded-xl border transition"
          :class="[
            editing && selectedIds.has(creature.id)
              ? 'border-accent opacity-100 ring-2 ring-accent'
              : isOwned(creature.id)
                ? isAwakened(creature.id)
                  ? 'border-pink-500/40 ring-1 ring-pink-500/20'
                  : 'border-primary/40 ring-1 ring-primary/20'
                : 'border-border/60 opacity-55',
            selectedCreatureId === creature.id
              ? 'border-primary/40 opacity-100 ring-2 ring-primary/60'
              : '',
            editing ? '' : 'hover:-translate-y-0.5 hover:opacity-100 hover:shadow-glow',
          ]"
          @click="editing ? emit('toggle-selected', creature.id) : emit('select', creature)"
        >
          <!-- Selection indicator (edit mode) -->
          <div
            v-if="editing"
            class="absolute -left-2.5 -top-2.5 z-20 flex size-6 items-center justify-center rounded-md border shadow-sm"
            :class="
              selectedIds.has(creature.id)
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            "
          >
            <Check v-if="selectedIds.has(creature.id)" class="size-3.5" />
            <Plus v-else class="size-3.5" />
          </div>

          <!-- Summoned status icon -->
          <img
            loading="lazy"
            :src="
              isOwned(creature.id)
                ? isAwakened(creature.id)
                  ? awakenedSummonedIcon
                  : summonedIcon
                : notSummonedIcon
            "
            :alt="
              isOwned(creature.id)
                ? isAwakened(creature.id)
                  ? t('beastiary.grid.awakenedAlt')
                  : t('beastiary.grid.summonedAlt')
                : t('beastiary.grid.notSummonedAlt')
            "
            class="absolute left-2.5 top-3.5 z-10 size-5 drop-shadow-md"
          />

          <!-- Tier badge -->
          <span
            class="absolute -right-1.5 -top-1.5 z-10 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground shadow-sm"
          >
            T{{ creature.tier + 1 }}
          </span>

          <!-- Type chips -->
          <div class="absolute right-1.5 top-5 z-10 flex flex-col items-end gap-0.5">
            <span
              v-for="type in creature.types"
              :key="type"
              class="rounded-full border px-1.5 py-px text-[10px] font-semibold leading-tight shadow-sm"
              :style="{
                color: typeColor(type),
                backgroundColor: `hsl(${typeColorVar(type)} / 0.15)`,
                borderColor: `hsl(${typeColorVar(type)} / 0.35)`,
              }"
            >
              {{ type }}
            </span>
          </div>

          <!-- Hero image -->
          <div
            class="flex items-center justify-center rounded-t-xl px-4 pb-5 pt-6"
            :style="{
              background: `linear-gradient(180deg, hsl(${typeColorVar(creature.types[0])} / 0.12) 0%, hsl(var(--card)) 100%)`,
            }"
          >
            <img
              :src="getCreatureImage(creature)"
              :alt="`${creature.name} artwork`"
              class="size-24 rounded-xl object-cover"
              loading="lazy"
            />
          </div>

          <!-- Divider -->
          <div class="h-px bg-border/60" />

          <!-- Footer info -->
          <div class="space-y-2 rounded-b-xl bg-card/80 px-3 pb-3 pt-2.5">
            <div class="text-center">
              <p
                class="truncate text-lg font-extrabold"
                :class="
                  isAwakened(creature.id)
                    ? 'text-pink-600 dark:text-pink-400'
                    : 'text-foreground/80'
                "
              >
                {{ creature.name }}
              </p>
              <p
                v-if="!editing && isOwned(creature.id)"
                class="font-mono text-xs text-foreground/80"
              >
                {{ t('beastiary.grid.lvl') }}
                <span class="font-bold text-foreground">{{ getLevel(creature.id) }}</span
                ><span class="text-muted-foreground"
                  >/{{ maxLevelForState(isAwakened(creature.id)) }}</span
                >
              </p>
            </div>

            <!-- Level hybrid slider-stepper (edit mode + owned) -->
            <div v-if="isOwned(creature.id) && editing" class="space-y-1.5" @click.stop>
              <!-- Stepper: [−] input [+] -->
              <div class="flex w-full items-center justify-center gap-1">
                <button
                  class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="getLevel(creature.id) <= 1"
                  :aria-label="t('beastiary.grid.decreaseLevel')"
                  @click="stepLevel(creature.id, -1)"
                >
                  <Minus class="size-3.5" />
                </button>
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="focus-ring h-7 w-12 rounded-md border border-input bg-background/85 text-center font-mono text-xs font-semibold"
                  :value="getLevel(creature.id)"
                  :aria-label="t('beastiary.grid.creatureLevel')"
                  @blur="normalizeLevelOnBlur(creature.id, $event)"
                  @keydown.enter="($event.target as HTMLInputElement).blur()"
                />
                <button
                  class="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="getLevel(creature.id) >= maxLevelForState(isAwakened(creature.id))"
                  :aria-label="t('beastiary.grid.increaseLevel')"
                  @click="stepLevel(creature.id, 1)"
                >
                  <Plus class="size-3.5" />
                </button>
              </div>
              <!-- Range slider -->
              <input
                type="range"
                min="1"
                :max="maxLevelForState(isAwakened(creature.id))"
                :value="getLevel(creature.id)"
                class="level-slider h-1.5 w-full cursor-pointer"
                :aria-label="t('beastiary.grid.levelSlider')"
                @input="setLevel(creature.id, +($event.target as HTMLInputElement).value)"
              />
              <!-- Awakened toggle -->
              <button
                class="flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition"
                :class="
                  isAwakened(creature.id)
                    ? 'border-pink-500/40 bg-pink-500/10 text-pink-400'
                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                "
                @click="setAwakened(creature.id, !isAwakened(creature.id))"
              >
                <span>&#9733;</span>
                {{
                  isAwakened(creature.id)
                    ? t('beastiary.grid.awakened')
                    : t('beastiary.grid.awaken')
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Level slider styling */
.level-slider {
  -webkit-appearance: none;
  appearance: none;
  border-radius: 3px;
  background: hsl(var(--muted));
}
.level-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: hsl(var(--primary));
  cursor: pointer;
  margin-top: -4px;
}
.level-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: hsl(var(--primary));
  cursor: pointer;
}
.level-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: hsl(var(--muted));
}
.level-slider::-moz-range-track {
  height: 6px;
  border-radius: 3px;
  background: hsl(var(--muted));
}
</style>
