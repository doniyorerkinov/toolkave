<script setup lang="ts">
import { LOCALES, type Locale } from '~/data/tools'

/**
 * Switching language lands on the translated slug for the current page
 * (/text/word-counter -> /ru/tekst/schetchik-slov), resolved from the registry.
 * Locales where the page does not exist are not offered at all.
 */
const { t, locale, locales } = useI18n()
const alternates = useLocaleAlternates()

const options = computed(() => {
  const names = locales.value as { code: string; name?: string }[]
  return LOCALES.map(code => ({
    code,
    name: names.find(l => l.code === code)?.name ?? code,
    path: alternates.value[code as Locale]
  })).filter((option): option is { code: Locale; name: string; path: string } => !!option.path)
})
</script>

<template>
  <nav :aria-label="t('nav.language')" class="flex items-center gap-1">
    <template v-for="option in options" :key="option.code">
      <span
        v-if="option.code === locale"
        class="rounded px-2 py-1 text-sm font-medium text-slate-900"
        aria-current="true"
      >
        {{ option.name }}
      </span>
      <NuxtLink
        v-else
        :to="option.path"
        class="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        {{ option.name }}
      </NuxtLink>
    </template>
  </nav>
</template>
