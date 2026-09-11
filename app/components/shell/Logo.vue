<script setup lang="ts">
defineProps<{ compact?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <!-- The cave: an arch on ember, and the light inside it. -->
    <svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" class="fill-ember-500" />
      <path
        d="M8.5 24.5V16a7.5 7.5 0 0 1 15 0v8.5"
        fill="none"
        class="stroke-stone-950"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <circle cx="16" cy="19.5" r="2.6" class="fill-stone-950" />
    </svg>
    <span v-if="!compact" class="text-lg font-extrabold tracking-tight">Toolkave</span>
  </span>
</template>
