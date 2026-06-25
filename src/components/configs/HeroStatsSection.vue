<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import SectionEyebrow from '@/components/shared/SectionEyebrow.vue'
import { getPlayerLevelXpBonus } from '@/utils/formulas'

const { t } = useI18n()


interface TierBucket {
  tier: number
  owned: number
  total: number
  awakened: number
}


interface CollectionSummary {
  owned: number
  total: number
  awakened: number
  tiers: TierBucket[]
}


interface SkillGroup {
  label: string
  skills: Array<{ id: string; icon: string }>
}


defineProps<{
  collectionSummary: CollectionSummary
  displayPlayerLevel: number
  skillGroups: SkillGroup[]
  displaySkillLevel: (skillId: string) => number
}>()
</script>

<template>
  <section class="grid gap-3 md:grid-cols-[1.4fr_1fr]">
    <!-- Creatures Collected -->
    <div class="relative overflow-hidden rounded-xl border border-border bg-card/50 p-5">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -left-12 -top-12 size-48 rounded-full bg-accent/15 blur-3xl"
      />
      <div class="relative">
        <SectionEyebrow>{{ t('configs.hero.creaturesCollected') }}</SectionEyebrow>
        <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="font-mono text-6xl font-extrabold leading-none text-foreground">
            {{ collectionSummary.owned
            }}<span class="text-3xl text-muted-foreground/60">/{{ collectionSummary.total }}</span>
          </span>
          <span
            v-if="collectionSummary.awakened"
            class="text-sm font-semibold text-awakened-strong"
          >
            ★ {{ t('configs.hero.awakenedCount', { n: collectionSummary.awakened }) }}
          </span>
        </div>
        <div class="mt-4 space-y-1.5">
          <div
            v-for="tierBucket in collectionSummary.tiers"
            :key="tierBucket.tier"
            class="flex items-center gap-2"
          >
            <span
              class="w-12 shrink-0 text-3xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {{ t('configs.creatures.tier', { n: tierBucket.tier + 1 }) }}
            </span>
            <div class="flex flex-1 gap-0.5">
              <span
                v-for="i in tierBucket.total"
                :key="i"
                class="h-2.5 flex-1 rounded-sm"
                :class="
                  i <= tierBucket.awakened
                    ? 'bg-awakened'
                    : i <= tierBucket.owned
                      ? 'bg-accent'
                      : 'bg-muted/40'
                "
              />
            </div>
            <span class="w-12 shrink-0 text-right font-mono text-3xs font-bold tabular-nums">
              {{ tierBucket.owned }}/{{ tierBucket.total }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Player Level -->
    <div class="relative overflow-hidden rounded-xl border border-border bg-card/50 p-5">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-primary/15 blur-3xl"
      />
      <div class="relative">
        <SectionEyebrow>{{ t('configs.hero.playerLevel') }}</SectionEyebrow>
        <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="font-mono text-6xl font-extrabold leading-none text-foreground">
            {{ displayPlayerLevel }}
          </span>
          <span class="text-sm font-semibold text-success-strong">
            {{
              t('configs.skills.xpBonus', {
                pct: getPlayerLevelXpBonus(displayPlayerLevel).toFixed(2),
              })
            }}
          </span>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-x-3 gap-y-1.5">
          <div
            v-for="sk in skillGroups.flatMap((g) => g.skills)"
            :key="sk.id"
            class="flex items-center gap-1.5"
            :title="sk.id"
          >
            <img
              v-if="sk.icon"
              :src="sk.icon"
              :alt="sk.id"
              class="size-4 shrink-0 object-contain"
              loading="lazy"
            />
            <span class="w-16 shrink-0 truncate text-3xs font-semibold text-muted-foreground">
              {{ sk.id }}
            </span>
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div
                class="h-full"
                :class="displaySkillLevel(sk.id) >= 99 ? 'bg-warning' : 'bg-accent'"
                :style="{ width: `${Math.min(100, (displaySkillLevel(sk.id) / 99) * 100)}%` }"
              />
            </div>
            <span
              class="w-5 shrink-0 text-right font-mono text-3xs font-bold tabular-nums"
              :class="displaySkillLevel(sk.id) >= 99 ? 'text-warning-strong' : ''"
            >
              {{ displaySkillLevel(sk.id) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
