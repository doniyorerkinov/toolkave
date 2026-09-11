<script setup lang="ts">
import {
  LOCALES,
  categoriesWithTools,
  categoryPath,
  toolsInCategory,
  type Locale
} from '~/data/tools'
import { TONES } from '~/utils/tone'

const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value as Locale)

/**
 * The home page shows a taste of each category, not the whole catalogue —
 * the category page is where the full list lives, and the count on the link
 * says how much more there is. Registry order puts the traffic tools first.
 */
const FEATURED = 6

const groups = computed(() =>
  categoriesWithTools(currentLocale.value, import.meta.dev).map(category => {
    const all = toolsInCategory(category.id, currentLocale.value, import.meta.dev)
    return {
      id: category.id,
      icon: category.icon,
      tone: TONES[category.id],
      name: t(`categories.${category.id}.name`),
      description: t(`categories.${category.id}.description`),
      href: categoryPath(category, currentLocale.value),
      count: all.length,
      tools: all.slice(0, FEATURED),
      hasMore: all.length > FEATURED
    }
  })
)

const trust = [
  { key: 'private', icon: 'shield-check' },
  { key: 'free', icon: 'badge-check' },
  { key: 'anywhere', icon: 'smartphone' }
] as const

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
  <div class="relative overflow-hidden">
    <!-- Lantern light spilling in from above the cave mouth. -->
    <div
      class="pointer-events-none absolute -top-48 left-1/2 h-[30rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-ember-200),transparent)] opacity-70"
      aria-hidden="true"
    />

    <div class="relative mx-auto w-full max-w-6xl px-4 pt-14 pb-6 sm:pt-20">
      <section class="max-w-2xl">
        <h1 class="text-4xl font-extrabold tracking-tight text-stone-950 sm:text-5xl">
          {{ t('home.heroTitle') }}
        </h1>
        <p class="mt-4 text-lg leading-relaxed text-stone-600">{{ t('home.heroSubtitle') }}</p>
        <ul class="mt-6 flex flex-wrap gap-2">
          <li
            v-for="item in trust"
            :key="item.key"
            class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700"
          >
            <ShellIcon :name="item.icon" :size="16" class="text-ember-600" />
            {{ t(`why.${item.key}.title`) }}
          </li>
        </ul>
      </section>

      <section v-for="group in groups" :key="group.id" class="mt-14">
        <div class="flex items-end justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-xl" :class="group.tone.tile">
              <ShellIcon :name="group.icon" :size="22" />
            </span>
            <div>
              <h2 class="text-xl font-bold tracking-tight text-stone-950">{{ group.name }}</h2>
              <p class="mt-0.5 max-w-prose text-sm text-stone-600">{{ group.description }}</p>
            </div>
          </div>
          <NuxtLink
            v-if="group.hasMore"
            :to="group.href"
            class="hidden shrink-0 items-center gap-1 text-sm font-semibold text-ember-700 hover:text-ember-800 hover:underline sm:inline-flex"
          >
            {{ t('home.allCount', { n: group.count }) }}
            <ShellIcon name="arrow-right" :size="16" />
          </NuxtLink>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ShellToolCard v-for="tool in group.tools" :key="tool.id" :tool="tool" />
        </div>

        <NuxtLink
          v-if="group.hasMore"
          :to="group.href"
          class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ember-700 hover:underline sm:hidden"
        >
          {{ t('home.allCount', { n: group.count }) }}
          <ShellIcon name="arrow-right" :size="16" />
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
