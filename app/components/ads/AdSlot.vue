<script setup lang="ts">
/**
 * Single ad component; placement and network are props.
 *
 * Inert until Phase 6 — it renders nothing in production so there is no empty
 * box and no layout shift. In dev it draws an outline so placements stay
 * visible while building pages.
 *
 * Rules when this is switched on: load network scripts once in the layout,
 * lazily, after hydration; never render between input and result; max 3-4
 * units per page.
 */
defineProps<{
  placement: 'top' | 'sidebar' | 'below-result'
}>()

const isDev = import.meta.dev
</script>

<template>
  <div
    v-if="isDev"
    class="flex items-center justify-center rounded-lg border border-dashed border-stone-300 p-4 text-xs tracking-wide text-stone-500 uppercase"
    :data-placement="placement"
  >
    ad · {{ placement }}
  </div>
</template>
