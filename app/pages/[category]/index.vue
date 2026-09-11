<script setup lang="ts">
import { categoryBySlug, toolsInCategory, type Locale } from '~/data/tools'
import { TONES } from '~/utils/tone'

const route = useRoute()
const { t, locale } = useI18n()

const currentLocale = computed(() => locale.value as Locale)
const categorySlug = computed(() => String(route.params.category ?? ''))

const category = computed(() => categoryBySlug(categorySlug.value, currentLocale.value))

if (!category.value) {
  throw createError({ statusCode: 404, statusMessage: 'Category not found', fatal: true })
}

useCategorySeo(category.value, currentLocale.value)

const tone = computed(() => TONES[category.value!.id])

const categoryTools = computed(() =>
  toolsInCategory(category.value!.id, currentLocale.value, import.meta.dev)
)
</script>

<template>
  <div v-if="category" class="mx-auto w-full max-w-6xl px-4 py-10">
    <header class="flex items-start gap-4">
      <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl" :class="tone.tile">
        <ShellIcon :name="category.icon" :size="28" />
      </span>
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
          {{ t(`categories.${category.id}.heading`) }}
        </h1>
        <p class="mt-2 max-w-prose text-base leading-relaxed text-stone-600">
          {{ t(`categories.${category.id}.description`) }}
        </p>
        <p class="mt-2 text-sm font-medium text-stone-500">
          {{ t('home.allCount', { n: categoryTools.length }) }}
        </p>
      </div>
    </header>

    <div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ShellToolCard v-for="tool in categoryTools" :key="tool.id" :tool="tool" />
    </div>
  </div>
</template>
