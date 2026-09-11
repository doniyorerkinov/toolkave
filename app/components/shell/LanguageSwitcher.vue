<script setup lang="ts">
import { LOCALES, type Locale } from '~/data/tools'

/**
 * Switching language lands on the translated slug for the current page
 * (/text/word-counter -> /ru/tekst/schetchik-slov), resolved from the registry.
 * Locales where the page does not exist are not offered at all.
 *
 * Styled for the dark header and footer, its two homes.
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
  <nav :aria-label="t('nav.language')" class="flex items-center gap-0.5 rounded-full bg-white/10 p-1">
    <template v-for="option in options" :key="option.code">
      <span
        v-if="option.code === locale"
        class="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-950"
        aria-current="page"
      >
        <span class="sm:hidden">{{ option.code.toUpperCase() }}</span>
        <span class="hidden sm:inline">{{ option.name }}</span>
      </span>
      <NuxtLink
        v-else
        :to="option.path"
        class="rounded-full px-2.5 py-1 text-xs font-medium text-stone-300 transition hover:text-white"
      >
        <span class="sm:hidden">{{ option.code.toUpperCase() }}</span>
        <span class="hidden sm:inline">{{ option.name }}</span>
      </NuxtLink>
    </template>
  </nav>
</template>
