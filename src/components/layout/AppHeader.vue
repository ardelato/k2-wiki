<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <RouterLink to="/" class="brand">
        <span class="brand-title">Koltera 2</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/" v-slot="{ isActive }" custom>
          <a
            href="/"
            :class="['nav-link', { 'nav-link--active': isActive }]"
            @click.prevent="$router.push('/')"
          >
            <svg
              class="nav-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Beastiary
          </a>
        </RouterLink>
        <RouterLink to="/expeditions" v-slot="{ isActive }" custom>
          <a
            href="/expeditions"
            :class="['nav-link', { 'nav-link--active': isActive }]"
            @click.prevent="$router.push('/expeditions')"
          >
            <svg
              class="nav-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            Expeditions
          </a>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: color-mix(in srgb, var(--color-bg-card) 80%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border);
  z-index: 100;
}

.header-inner {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 16px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 32px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-decoration: none;
  transition:
    color 0.15s,
    background-color 0.15s;
}

.nav-link:hover {
  color: var(--color-text);
  background-color: var(--color-bg-hover);
}

.nav-link--active {
  background-color: var(--color-primary);
  color: var(--color-primary-fg);
}

.nav-link--active:hover {
  background-color: var(--color-primary);
  color: var(--color-primary-fg);
}

.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
