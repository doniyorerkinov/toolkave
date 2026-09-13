<script setup lang="ts">
import { LOCALES, type Locale } from '~/data/tools'

/**
 * The four prose pages — privacy, terms, about, contact — share one layout.
 *
 * Their content lives in the locale files as a list of sections, so a
 * translation is a translation rather than a fourth copy of the markup, and
 * adding a clause means adding it in three JSON files rather than three
 * templates.
 */
const props = defineProps<{ doc: 'privacy' | 'terms' | 'about' | 'contact' }>()

const { t, tm, rt, locale } = useI18n()

interface Section { heading: string; body: string[] }

/**
 * `tm` returns compiled message objects rather than strings, so every leaf
 * goes through `rt` before it can be rendered.
 */
const sections = computed<Section[]>(() =>
  (tm(`legal.${props.doc}.sections`) as unknown[]).map(entry => {
    const section = entry as { heading: unknown; body: unknown[] }
    return {
      heading: rt(section.heading as never),
      body: section.body.map(line => rt(line as never))
    }
  })
)

const path = computed(() => `/${props.doc}`)

const alternates: Partial<Record<Locale, string>> = {}
for (const candidate of LOCALES) {
  alternates[candidate] = candidate === 'en' ? path.value : `/${candidate}${path.value}`
}

usePageSeo({
  title: t(`legal.${props.doc}.metaTitle`),
  description: t(`legal.${props.doc}.description`),
  path: locale.value === 'en' ? path.value : `/${locale.value}${path.value}`,
  alternates
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-10">
    <h1 class="text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
      {{ t(`legal.${doc}.title`) }}
    </h1>
    <p class="mt-4 text-lg leading-relaxed text-stone-700">{{ t(`legal.${doc}.lead`) }}</p>
    <p v-if="doc !== 'about' && doc !== 'contact'" class="mt-2 text-sm text-stone-500">
      {{ t('legal.updated') }}
    </p>

    <div class="mt-10 space-y-8">
      <section v-for="section in sections" :key="section.heading">
        <h2 class="text-lg font-semibold text-stone-900">{{ section.heading }}</h2>
        <p v-for="line in section.body" :key="line" class="mt-2 leading-relaxed text-stone-700">
          {{ line }}
        </p>
      </section>
    </div>
  </div>
</template>
