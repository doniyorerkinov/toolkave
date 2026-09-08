<script setup lang="ts">
import { categoryBySlug, toolsInCategory, type Locale } from '~/data/tools'

const route = useRoute()
const { t, locale } = useI18n()

const currentLocale = computed(() => locale.value as Locale)
const categorySlug = computed(() => String(route.params.category ?? ''))

const category = computed(() => categoryBySlug(categorySlug.value, currentLocale.value))

if (!category.value) {
  throw createError({ statusCode: 404, statusMessage: 'Category not found', fatal: true })
}

useCategorySeo(category.value, currentLocale.value)

const categoryTools = computed(() => toolsInCategory(category.value!.id, currentLocale.value))
</script>

<template>
  <div v-if="category" class="mx-auto w-full max-w-6xl px-4 py-8">
    <h1 class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
      {{ t(`categories.${category.id}.name`) }}
    </h1>
    <p class="mt-2 max-w-prose text-base leading-relaxed text-slate-600">
      {{ t(`categories.${category.id}.description`) }}
    </p>

    <div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ShellToolCard v-for="tool in categoryTools" :key="tool.id" :tool="tool" />
    </div>
  </div>
</template>
