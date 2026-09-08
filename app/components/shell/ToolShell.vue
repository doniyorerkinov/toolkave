<script setup lang="ts">
import {
  categoryPath,
  getCategory,
  toolPath,
  tools as allTools,
  type Locale,
  type ToolDef
} from '~/data/tools'

const props = defineProps<{ tool: ToolDef }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const currentLocale = computed(() => locale.value as Locale)

const category = computed(() => getCategory(props.tool.category)!)
const categoryName = computed(() => t(`categories.${props.tool.category}.name`))
const categoryHref = computed(() => categoryPath(category.value, currentLocale.value))

const howToSteps = computed(() => [
  t(`tools.${props.tool.id}.howTo.step1`),
  t(`tools.${props.tool.id}.howTo.step2`),
  t(`tools.${props.tool.id}.howTo.step3`)
])

const faqItems = computed(() =>
  [1, 2, 3, 4, 5].map(n => ({
    q: t(`tools.${props.tool.id}.faq.q${n}`),
    a: t(`tools.${props.tool.id}.faq.a${n}`)
  }))
)

const relatedTools = computed(() =>
  props.tool.related
    .map(id => allTools.find(candidate => candidate.id === id))
    .filter((candidate): candidate is ToolDef => !!candidate)
    .filter(candidate => !!toolPath(candidate, currentLocale.value))
)
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
    <div class="min-w-0">
      <nav aria-label="Breadcrumb" class="mb-4 text-sm text-slate-500">
        <ol class="flex flex-wrap items-center gap-1.5">
          <li>
            <NuxtLink :to="localePath('/')" class="hover:text-slate-900 hover:underline">
              {{ t('shell.breadcrumbHome') }}
            </NuxtLink>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <NuxtLink :to="categoryHref" class="hover:text-slate-900 hover:underline">
              {{ categoryName }}
            </NuxtLink>
          </li>
          <li aria-hidden="true">›</li>
          <li class="font-medium text-slate-700">{{ t(`tools.${tool.id}.name`) }}</li>
        </ol>
      </nav>

      <header class="mb-6">
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {{ t(`tools.${tool.id}.name`) }}
        </h1>
        <p class="mt-2 text-base text-slate-600">{{ t(`tools.${tool.id}.short`) }}</p>
      </header>

      <!-- Tool area: above the fold, before any ad. -->
      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <slot />
      </section>

      <!-- Ads never appear between input and result. -->
      <AdsAdSlot placement="below-result" class="my-8" />

      <p class="mt-8 max-w-prose text-base leading-relaxed text-slate-700">
        {{ t(`tools.${tool.id}.intro`) }}
      </p>

      <ShellHowTo :steps="howToSteps" class="mt-10" />
      <ShellWhyBlocks class="mt-10" />
      <ShellFaq :items="faqItems" class="mt-10" />
      <ShellRelatedTools v-if="relatedTools.length" :tools="relatedTools" class="mt-10" />
    </div>

    <aside class="mt-10 hidden lg:mt-0 lg:block">
      <AdsAdSlot placement="sidebar" class="mb-6" />
      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <h2 class="mb-3 text-sm font-semibold text-slate-900">
          {{ t('shell.allInCategory', { category: categoryName }) }}
        </h2>
        <NuxtLink :to="categoryHref" class="text-sm text-sky-700 hover:text-sky-900 hover:underline">
          {{ categoryName }} →
        </NuxtLink>
      </div>
    </aside>
  </div>
</template>
