<script setup lang="ts">
import {
  LOCALES,
  categoriesWithTools,
  categoryPath,
  toolsInCategory,
  type Locale
} from '~/data/tools'

const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value as Locale)

const groups = computed(() =>
  categoriesWithTools(currentLocale.value, import.meta.dev).map(category => ({
    id: category.id,
    name: t(`categories.${category.id}.name`),
    description: t(`categories.${category.id}.description`),
    href: categoryPath(category, currentLocale.value),
    tools: toolsInCategory(category.id, currentLocale.value, import.meta.dev)
  }))
)

const alternates: Partial<Record<Locale, string>> = {}
for (const candidate of LOCALES) {
  alternates[candidate] = candidate === 'en' ? '/' : `/${candidate}`
}

usePageSeo({
  title: `${t('site.name')} | ${t('site.tagline')}`,
  description: t('site.description'),
  path: currentLocale.value === 'en' ? '/' : `/${currentLocale.value}`,
  alternates
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-10">
    <section class="max-w-2xl">
      <h1 class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {{ t('home.heroTitle') }}
      </h1>
      <p class="mt-3 text-lg leading-relaxed text-slate-600">{{ t('home.heroSubtitle') }}</p>
    </section>

    <section v-for="group in groups" :key="group.id" class="mt-10">
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="text-xl font-semibold tracking-tight text-slate-900">{{ group.name }}</h2>
        <NuxtLink :to="group.href" class="text-sm text-sky-700 hover:text-sky-900 hover:underline">
          {{ t('nav.allTools') }}
        </NuxtLink>
      </div>
      <p class="mt-1 max-w-prose text-sm text-slate-600">{{ group.description }}</p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ShellToolCard v-for="tool in group.tools" :key="tool.id" :tool="tool" />
      </div>
    </section>
  </div>
</template>
