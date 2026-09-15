<script setup lang="ts">
/**
 * What is happening, during the one operation on this site that is slow.
 *
 * Two phases, because they fail differently in a person's head. Loading is a
 * 31 MB download with no progress ffmpeg can report, and on a slow connection
 * it looks exactly like a frozen page — so it says what it is doing and why it
 * only happens once. Running does have progress, and gets a real bar.
 */
defineProps<{ phase: 'idle' | 'loading' | 'running'; progress: number }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="phase !== 'idle'" class="rounded-lg border border-stone-300 bg-stone-50 p-4">
    <p class="text-sm font-medium text-stone-900">
      {{ phase === 'loading' ? t('media.loadingCore') : t('media.working', { n: Math.round(progress * 100) }) }}
    </p>
    <p v-if="phase === 'loading'" class="mt-1 text-xs text-stone-600">{{ t('media.loadingNote') }}</p>

    <div class="mt-3 h-2 overflow-hidden rounded-full bg-stone-300">
      <div
        class="h-full rounded-full bg-ember-600 transition-[width] duration-300"
        :class="phase === 'loading' ? 'animate-pulse' : ''"
        :style="{ width: phase === 'loading' ? '100%' : `${Math.max(2, progress * 100)}%` }"
      />
    </div>
  </div>
</template>
