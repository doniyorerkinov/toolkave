<script setup lang="ts">
const { t } = useI18n()

const items = [
  { key: 'private', icon: 'shield-check' },
  { key: 'free', icon: 'badge-check' },
  { key: 'fast', icon: 'zap' },
  { key: 'anywhere', icon: 'smartphone' }
] as const
</script>

<template>
  <section>
    <h2 class="text-xl font-bold tracking-tight text-stone-950">{{ t('shell.why') }}</h2>
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <div v-for="item in items" :key="item.key" class="flex gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ember-100 text-ember-700">
          <ShellIcon :name="item.icon" :size="18" />
        </span>
        <div>
          <h3 class="font-semibold text-stone-900">{{ t(`why.${item.key}.title`) }}</h3>
          <p class="mt-1 text-sm leading-relaxed text-stone-600">{{ t(`why.${item.key}.body`) }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
