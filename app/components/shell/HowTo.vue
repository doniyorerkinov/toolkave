<script setup lang="ts">
defineProps<{ steps: string[] }>()
const { t } = useI18n()
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold tracking-tight text-slate-900">{{ t('shell.howTo') }}</h2>
    <ol class="mt-4 space-y-3">
      <li v-for="(step, index) in steps" :key="index" class="flex gap-3">
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800"
          aria-hidden="true"
        >
          {{ index + 1 }}
        </span>
        <span class="pt-0.5 text-slate-700">{{ step }}</span>
      </li>
    </ol>
  </section>
</template>
