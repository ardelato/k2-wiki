<script setup lang="ts">
 /**
 * Shimmer placeholder shown while a lazily-loaded planner tab view fetches its
 * chunk (wired as the `loadingComponent` of the async tab views in
 * PlannerShellView). Keeps the tab area from looking frozen during the import.
 * Decorative only — hidden from assistive tech.
 */
</script>

<template>
  <div class="animate-pulse space-y-4 py-2" aria-hidden="true">
    <!-- Toolbar row -->
    <div class="flex items-center gap-2">
      <div class="h-9 w-36 rounded-lg bg-muted/60" />
      <div class="h-9 w-24 rounded-lg bg-muted/40" />
      <div class="ml-auto h-9 w-28 rounded-lg bg-muted/40" />
    </div>

    <!-- Content card rows -->
    <div class="space-y-3">
      <div v-for="i in 4" :key="i" class="surface-card flex items-center gap-3 p-4">
        <div class="size-12 shrink-0 rounded-lg bg-muted/60" />
        <div class="flex-1 space-y-2">
          <div class="h-4 w-1/3 rounded bg-muted/60" />
          <div class="h-3 w-1/2 rounded bg-muted/40" />
        </div>
        <div class="h-6 w-16 shrink-0 rounded-full bg-muted/40" />
      </div>
    </div>
  </div>
</template>
