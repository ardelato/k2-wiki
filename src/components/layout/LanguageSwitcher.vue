<script setup lang="ts">
import { Check, ChevronDown, Languages } from 'lucide-vue-next'
import { nextTick, ref } from 'vue'

import AppTooltip from '@/components/shared/AppTooltip.vue'
import { useLocale, type SupportedLocale } from '@/composables/useLocale'
import { t } from '@/i18n'

defineProps<{ collapsed: boolean }>()


const { currentLocale, currentLocaleShort, setLocale, locales } = useLocale()


const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})


async function toggle() {
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  isOpen.value = true
  await nextTick()
  const r = triggerRef.value?.getBoundingClientRect()
  if (r) {
    // Anchored to the bottom of the trigger so the menu opens upward
    // (the switcher lives at the bottom of the sidebar).
    menuStyle.value = {
      bottom: `${Math.round(window.innerHeight - r.top + 8)}px`,
      left: `${Math.round(r.left)}px`,
    }
  }
}


function close() {
  isOpen.value = false
}


async function choose(code: SupportedLocale) {
  await setLocale(code)
  close()
}
</script>

<template>
  <div class="relative">
    <AppTooltip
      :text="t('settings.changeLanguage')"
      :position="collapsed ? 'right' : 'top'"
      :disabled="isOpen"
    >
      <button
        ref="triggerRef"
        type="button"
        :aria-label="t('settings.changeLanguage')"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        class="focus-ring relative flex items-center rounded-lg text-muted-foreground transition hover:text-foreground"
        :class="[collapsed ? 'p-2' : 'gap-1 px-2 py-1.5', isOpen && 'text-foreground']"
        @click="toggle"
      >
        <Languages class="size-4 shrink-0" />
        <span
          v-if="collapsed"
          class="absolute -bottom-0.5 -right-0.5 rounded-sm bg-muted px-0.5 text-[8px] font-bold leading-[1.3] text-foreground ring-1 ring-border"
          >{{ currentLocaleShort }}</span
        >
        <template v-else>
          <span class="text-xs font-semibold leading-none">{{ currentLocaleShort }}</span>
          <ChevronDown
            class="size-3 opacity-50 transition-transform"
            :class="isOpen && 'rotate-180'"
          />
        </template>
      </button>
    </AppTooltip>

    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-50" @click="close" />
      <div
        v-if="isOpen"
        class="fixed z-[51] min-w-44 overflow-hidden rounded-xl border border-border/70 bg-card/95 p-1 shadow-2xl backdrop-blur"
        :style="menuStyle"
        role="listbox"
        @keydown.esc.stop.prevent="close"
      >
        <button
          v-for="l in locales"
          :key="l.code"
          type="button"
          role="option"
          :aria-selected="l.code === currentLocale"
          class="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition"
          :class="
            l.code === currentLocale
              ? 'bg-primary/10 font-semibold text-foreground'
              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          "
          @click="choose(l.code)"
        >
          <span
            class="w-6 shrink-0 text-center text-xs font-bold leading-none"
            :class="l.code === currentLocale ? 'text-primary' : 'text-muted-foreground/70'"
            >{{ l.short }}</span
          >
          <span class="flex-1 truncate">{{ l.name }}</span>
          <Check v-if="l.code === currentLocale" class="size-4 shrink-0 text-primary" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
