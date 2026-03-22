<script setup lang="ts">
import { Github } from 'lucide-vue-next'

import SteamIcon from '@/components/icons/SteamIcon.vue'
</script>

<template>
  <footer class="hidden border-t border-border/70 bg-card/40 md:block">
    <div class="mx-auto max-w-app px-4 py-6 sm:px-6">
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="flex items-center gap-4">
          <a
            href="https://github.com/ardelato/k2-wiki"
            target="_blank"
            rel="noopener noreferrer"
            class="focus-ring inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <Github class="size-4" />
            <span>GitHub</span>
          </a>
          <a
            href="https://store.steampowered.com/app/2834700/Koltera_2/"
            target="_blank"
            rel="noopener noreferrer"
            class="focus-ring inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <SteamIcon class="size-4" />
            <span>Steam</span>
          </a>
        </div>
        <p class="text-xs text-muted-foreground/70">
          This is an unofficial fan project and is not affiliated with or endorsed by Braymen, the
          developer of Koltera 2.
        </p>
      </div>
    </div>
  </footer>
</template>
