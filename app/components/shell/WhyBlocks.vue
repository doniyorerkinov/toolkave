<script setup lang="ts">
const { t } = useI18n()
const keys = ['private', 'free', 'fast', 'anywhere'] as const
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold tracking-tight text-slate-900">{{ t('shell.why') }}</h2>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <div v-for="key in keys" :key="key" class="rounded-lg border border-slate-200 bg-white p-4">
        <h3 class="font-medium text-slate-900">{{ t(`why.${key}.title`) }}</h3>
        <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ t(`why.${key}.body`) }}</p>
      </div>
    </div>
  </section>
</template>
