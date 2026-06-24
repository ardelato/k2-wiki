<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useGameConfig } from '@/composables/useGameConfig'
import { useTools } from '@/composables/useTools'
import { itemById } from '@/data/indexes'
import { itemName } from '@/utils/format/format'
import { toolIcons, sourceIcons } from '@/utils/format/icons'
import { getItemImage } from '@/utils/images/itemImages'

const { t } = useI18n()


const {
  gatheringTools,
  workstationTools,
  otherTools,
  maxLevel,
  xpBonusPerLevel,
  speedBonusPerLevel,
  upgradeCosts,
  getXpBonus,
  getSpeedBonus,
} = useTools()


const { toolLevels, toolSpeedModes } = useGameConfig()


function getToolLevel(toolId: string): number {
  return toolLevels.value[toolId] ?? 0
}


const hasSaveData = computed(() => Object.keys(toolLevels.value).length > 0)


const toolGroups = computed(() => [
  { label: t('toolsView.gathering'), tools: gatheringTools.value },
  { label: t('toolsView.workstation'), tools: workstationTools.value },
  { label: t('toolsView.other'), tools: otherTools.value },
])


// Deep-link highlight: a planner advisory can open ?tool=<id> to flag that tool.
const route = useRoute()
const highlightTool = ref<string | null>(null)


onMounted(() => {
  const tool = typeof route.query.tool === 'string' ? route.query.tool : null
  if (!tool) return
  highlightTool.value = tool
  nextTick(() => {
    document
      .getElementById(`tool-card-${tool}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  window.setTimeout(() => {
    highlightTool.value = null
  }, 3500)
})
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold">{{ t('toolsView.title') }}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{
          t('toolsView.subtitle', {
            xpBonus: xpBonusPerLevel,
            maxXp: maxLevel * xpBonusPerLevel,
            maxLevel,
          })
        }}
        <span class="font-semibold">
          {{
            t('toolsView.workstationNote', {
              speedBonus: speedBonusPerLevel,
              maxSpeed: maxLevel * speedBonusPerLevel,
              maxLevel,
            })
          }}
        </span>
      </p>
    </div>

    <!-- Tool Groups -->
    <section v-for="group in toolGroups" :key="group.label">
      <h2 class="mb-4 text-lg font-semibold">{{ group.label }}</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="tool in group.tools"
          :id="`tool-card-${tool.id}`"
          :key="tool.id"
          class="overflow-hidden rounded-xl border border-border bg-card"
          :class="{ 'attn-ring': highlightTool === tool.id }"
        >
          <div class="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-4 py-3">
            <img
              v-if="toolIcons[tool.id]"
              :src="toolIcons[tool.id]"
              :alt="tool.name"
              class="size-8"
              loading="lazy"
            />
            <div>
              <h3 class="font-semibold">{{ tool.name }}</h3>
              <p class="text-xs text-muted-foreground">{{ tool.description }}</p>
            </div>
          </div>

          <div class="space-y-2 px-4 py-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('toolsView.skill') }}</span>
              <div class="flex items-center gap-1.5 font-medium">
                <img
                  v-if="sourceIcons[tool.skillId] || toolIcons[tool.id]"
                  :src="sourceIcons[tool.skillId] ?? toolIcons[tool.id]"
                  alt=""
                  class="size-4"
                  loading="lazy"
                />
                {{ tool.skillId }}
              </div>
            </div>
            <template v-if="hasSaveData">
              <div class="flex items-center justify-between border-t border-border/50 pt-2">
                <span class="text-muted-foreground">{{ t('toolsView.yourLevel') }}</span>
                <span class="font-semibold text-primary">
                  {{ getToolLevel(tool.id) }}/{{ maxLevel }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">{{ t('toolsView.yourXpBonus') }}</span>
                <span class="font-semibold text-primary">
                  +{{ getXpBonus(getToolLevel(tool.id)) }}%
                </span>
              </div>
              <template v-if="tool.category === 'workstation'">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">{{ t('toolsView.speedMode') }}</span>
                  <span
                    class="font-semibold"
                    :class="
                      toolSpeedModes[tool.skillId] ? 'text-success-strong' : 'text-muted-foreground'
                    "
                  >
                    {{
                      toolSpeedModes[tool.skillId]
                        ? `+${getSpeedBonus(getToolLevel(tool.id))}%`
                        : t('toolsView.speedModeOff')
                    }}
                  </span>
                </div>
              </template>
              <!-- Progress bar -->
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary transition-all"
                  :style="{ width: `${(getToolLevel(tool.id) / maxLevel) * 100}%` }"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- Upgrade Costs Table -->
    <section>
      <h2 class="mb-4 text-lg font-semibold">{{ t('toolsView.upgradeCosts') }}</h2>
      <div class="overflow-x-auto rounded-xl border border-border">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-muted/30">
              <th class="px-4 py-2.5 text-left font-semibold">{{ t('toolsView.level') }}</th>
              <th class="px-4 py-2.5 text-left font-semibold">{{ t('toolsView.barRequired') }}</th>
              <th class="px-4 py-2.5 text-right font-semibold">{{ t('toolsView.amount') }}</th>
              <th class="px-4 py-2.5 text-right font-semibold">{{ t('toolsView.xpBonus') }}</th>
              <th class="px-4 py-2.5 text-right font-semibold">
                {{ t('toolsView.speedBonus') }}
                <span class="block text-xs font-normal text-muted-foreground">
                  {{ t('toolsView.workstationOnly') }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(cost, index) in upgradeCosts"
              :key="index"
              class="border-b border-border/50"
            >
              <td class="px-4 py-2 font-medium">{{ index + 1 }}</td>
              <td class="px-4 py-2">
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
              <td class="px-4 py-2 text-right">{{ cost.amount }}</td>
              <td class="px-4 py-2 text-right">+{{ getXpBonus(index + 1) }}%</td>
              <td class="px-4 py-2 text-right">+{{ getSpeedBonus(index + 1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
