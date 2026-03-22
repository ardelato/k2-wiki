<script setup lang="ts">
import { X, Upload, AlertCircle, Check } from 'lucide-vue-next'
import { ref, computed } from 'vue'

import { useCreatureCollection } from '@/composables/useCreatureCollection'
import { useCreatures } from '@/composables/useCreatures'
import { getCreatureImage } from '@/utils/creatureImages'
import { decryptSave } from '@/utils/decrypt'
import { levelFromXp } from '@/utils/formulas'

const emit = defineEmits<{ close: [] }>()


const { creatures } = useCreatures()
const { setOwned, setLevel, setAwakened, isOwned, getLevel, isAwakened } = useCreatureCollection()


type ModalState = 'upload' | 'preview' | 'error'


const state = ref<ModalState>('upload')
const errorMessage = ref('')
const isDragging = ref(false)


interface SaveCreature {
  species: string
  experience: number
  awakened?: boolean
}


interface PreviewCreature {
  id: string
  name: string
  image: string
  tier: number
  level: number
  awakened: boolean
  isNew: boolean
  levelChanged: boolean
  awakenedChanged: boolean
  oldLevel: number
}


const previewCreatures = ref<PreviewCreature[]>([])


const creatureMap = computed(() => {
  const map = new Map<string, { name: string; image: string; tier: number; id: string }>()
  for (const c of creatures.value) {
    map.set(c.id, { name: c.name, image: c.image, tier: c.tier, id: c.id })
  }
  return map
})


const groupedByTier = computed(() => {
  const groups = new Map<number, PreviewCreature[]>()
  for (const c of previewCreatures.value) {
    const list = groups.get(c.tier) ?? []
    list.push(c)
    groups.set(c.tier, list)
  }
  return [...groups.entries()].toSorted(([a], [b]) => a - b)
})


const stats = computed(() => {
  const total = previewCreatures.value.length
  const newCount = previewCreatures.value.filter((c) => c.isNew).length
  const changed = previewCreatures.value.filter((c) => c.levelChanged || c.awakenedChanged).length
  return { total, newCount, changed }
})


async function processFile(file: File) {
  try {
    const text = await file.text()
    const save = (await decryptSave(text)) as { creatures?: SaveCreature[] }


    if (!save.creatures || !Array.isArray(save.creatures)) {
      throw new Error('No creature data found in save file')
    }


    // Deduplicate by species — keep the highest XP entry
    const bestBySpecies = new Map<string, SaveCreature>()
    for (const sc of save.creatures) {
      const existing = bestBySpecies.get(sc.species)
      if (!existing || sc.experience > existing.experience) {
        bestBySpecies.set(sc.species, sc)
      }
    }


    const preview: PreviewCreature[] = []
    for (const [species, sc] of bestBySpecies) {
      const meta = creatureMap.value.get(species)
      if (!meta) continue


      const level = levelFromXp(sc.experience)
      const awakened = sc.awakened ?? false
      const owned = isOwned(species)
      const oldLevel = getLevel(species)
      const oldAwakened = isAwakened(species)


      preview.push({
        id: meta.id,
        name: meta.name,
        image: meta.image,
        tier: meta.tier,
        level,
        awakened,
        isNew: !owned,
        levelChanged: owned && oldLevel !== level,
        awakenedChanged: owned && oldAwakened !== awakened,
        oldLevel,
      })
    }


    preview.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
    previewCreatures.value = preview
    state.value = 'preview'
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to process save file'
    state.value = 'error'
  }
}


function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) processFile(file)
}


function onDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) processFile(file)
}


function applyImport() {
  for (const c of previewCreatures.value) {
    setOwned(c.id, true)
    setLevel(c.id, c.level)
    setAwakened(c.id, c.awakened)
  }
  emit('close')
}


function retry() {
  state.value = 'upload'
  errorMessage.value = ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl">
          <!-- Header -->
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-bold">Import Save File</h2>
            <button
              class="focus-ring rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </div>

          <!-- Upload State -->
          <div v-if="state === 'upload'">
            <p class="mb-3 text-sm text-muted-foreground">
              Upload your Koltera 2 save file to import your creature collection.
            </p>
            <label
              class="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition"
              :class="
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-accent/50 hover:bg-muted/30'
              "
              @dragenter.prevent="isDragging = true"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="onDrop"
            >
              <Upload class="size-8 text-muted-foreground" />
              <span class="text-sm font-medium text-muted-foreground">
                Drop save file here or click to browse
              </span>
              <input type="file" accept=".json" class="hidden" @change="onFileSelect" />
            </label>
          </div>

          <!-- Preview State -->
          <div v-else-if="state === 'preview'">
            <div class="mb-3 flex flex-wrap gap-3 text-sm">
              <span class="rounded-md bg-muted/50 px-2 py-1 font-medium">
                {{ stats.total }} creatures found
              </span>
              <span
                v-if="stats.newCount"
                class="rounded-md bg-emerald-500/15 px-2 py-1 font-medium text-emerald-400"
              >
                +{{ stats.newCount }} new
              </span>
              <span
                v-if="stats.changed"
                class="rounded-md bg-amber-500/15 px-2 py-1 font-medium text-amber-400"
              >
                {{ stats.changed }} updated
              </span>
            </div>

            <div class="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              <div v-for="[tier, group] in groupedByTier" :key="tier">
                <h3
                  class="sticky top-0 z-10 mb-1.5 bg-card py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Tier {{ tier + 1 }}
                </h3>
                <div class="space-y-1">
                  <div
                    v-for="c in group"
                    :key="c.id"
                    class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                    :class="{
                      'bg-emerald-500/10': c.isNew,
                      'bg-amber-500/10': (c.levelChanged || c.awakenedChanged) && !c.isNew,
                    }"
                  >
                    <img
                      v-if="getCreatureImage(c)"
                      :src="getCreatureImage(c)"
                      :alt="c.name"
                      class="size-7 rounded object-cover"
                    />
                    <div v-else class="size-7 rounded bg-muted" />
                    <span class="flex-1 font-medium" :class="c.awakened ? 'text-pink-400' : ''">{{
                      c.name
                    }}</span>
                    <span
                      v-if="c.awakened"
                      class="text-xs"
                      :class="
                        c.awakenedChanged ? 'font-semibold text-pink-300' : 'text-pink-400/70'
                      "
                      >★ Awakened</span
                    >
                    <span class="tabular-nums text-muted-foreground">
                      <template v-if="c.levelChanged">
                        <span class="text-muted-foreground/60">{{ c.oldLevel }}</span>
                        <span class="mx-0.5">&rarr;</span>
                      </template>
                      Lv.{{ c.level }}
                    </span>
                    <span v-if="c.isNew" class="text-xs font-semibold text-emerald-400">NEW</span>
                    <Check
                      v-else-if="!c.levelChanged && !c.awakenedChanged"
                      class="size-3.5 text-muted-foreground/50"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              <button
                class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                class="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                @click="applyImport"
              >
                Apply
              </button>
            </div>
          </div>

          <!-- Error State -->
          <div v-else-if="state === 'error'">
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center"
            >
              <AlertCircle class="size-8 text-red-400" />
              <p class="text-sm font-medium text-red-300">{{ errorMessage }}</p>
              <button
                class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
                @click="retry"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
