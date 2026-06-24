<script setup lang="ts">
import { Check, ChevronDown, Languages } from 'lucide-vue-next'
import { nextTick, onMounted, ref } from 'vue'

import AppTooltip from '@/components/shared/AppTooltip.vue'
import { useLocale, type SupportedLocale } from '@/composables/core/useLocale'
import { useLocaleOnboarding } from '@/composables/core/useLocaleOnboarding'
import { t } from '@/i18n'

defineProps<{ collapsed: boolean }>()


const { currentLocale, currentLocaleShort, setLocale, locales } = useLocale()
const { showSwitcherHint, dismissHint } = useLocaleOnboarding()


const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const hintStyle = ref<Record<string, string>>({})


// Position a popover above the trigger (the switcher sits at the bottom of the
// sidebar, so overlays open upward). Returns {} when the trigger is hidden
// (e.g. the desktop rail's switcher while the mobile drawer is the live one),
// so the hint never anchors to an off-screen rect.
function anchorAbove(): Record<string, string> {
  const el = triggerRef.value
  if (!el || el.offsetParent === null) return {}
  const r = el.getBoundingClientRect()
  return {
    bottom: `${Math.round(window.innerHeight - r.top + 8)}px`,
    left: `${Math.round(r.left)}px`,
  }
}


onMounted(async () => {
  if (!showSwitcherHint.value) return
  await nextTick()
  hintStyle.value = anchorAbove()
})


async function toggle() {
  // Opening the switcher counts as discovering it; retire the hint.
  if (showSwitcherHint.value) dismissHint()
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  isOpen.value = true
  await nextTick()
  menuStyle.value = anchorAbove()
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
          class="absolute -bottom-0.5 -right-0.5 rounded-sm bg-muted px-0.5 text-3xs font-bold leading-[1.3] text-foreground ring-1 ring-border"
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

    <!-- One-time pointer so users seeing English discover other languages -->
    <Teleport to="body">
      <Transition name="locale-hint">
        <div
          v-if="showSwitcherHint && hintStyle.bottom"
          class="fixed z-[49] w-max max-w-[220px] rounded-xl border border-border/70 bg-card/95 p-3 shadow-2xl backdrop-blur"
          :style="hintStyle"
          role="status"
        >
          <div class="flex items-start gap-2">
            <Languages class="mt-0.5 size-4 shrink-0 text-primary" />
            <p class="text-xs leading-snug text-foreground">{{ t('localeHint.message') }}</p>
          </div>
          <button
            type="button"
            class="focus-ring mt-2 w-full rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20"
            @click="dismissHint"
          >
            {{ t('localeHint.gotIt') }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.locale-hint-enter-active,
.locale-hint-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.locale-hint-enter-from,
.locale-hint-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
