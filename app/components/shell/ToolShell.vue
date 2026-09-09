<script setup lang="ts">
import { onBeforeRouteLeave, type RouteLocationNormalized } from 'vue-router'
import {
  DEFAULT_LOCALE,
  LOCALES,
  categoryPath,
  getCategory,
  toolBySlug,
  toolPath,
  tools as allTools,
  type Locale,
  type ToolDef
} from '~/data/tools'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ tool: ToolDef }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const currentLocale = computed(() => locale.value as Locale)

const store = useFilesStore()

/**
 * Take ownership of the store for this tool. If files are left over from a
 * different tool they are dropped here, so Split can never silently inherit
 * Merge's input files.
 */
store.claim(props.tool.id)

const leaveDialogOpen = ref(false)
let resolveLeave: ((allow: boolean) => void) | null = null

/** Which tool a destination route points at, if any. */
function toolAt(route: RouteLocationNormalized): ToolDef | undefined {
  const segment = route.path.split('/')[1] ?? ''
  const destinationLocale = (
    LOCALES.includes(segment as Locale) ? segment : DEFAULT_LOCALE
  ) as Locale

  const category = route.params.category
  const tool = route.params.tool
  if (typeof category !== 'string' || typeof tool !== 'string') return undefined

  return toolBySlug(category, tool, destinationLocale)
}

onBeforeRouteLeave(async to => {
  if (!store.hasWork) return true

  // Switching language on the same tool keeps the files - it is the same work,
  // just a different URL.
  if (toolAt(to)?.id === props.tool.id) return true

  leaveDialogOpen.value = true
  const allow = await new Promise<boolean>(resolve => {
    resolveLeave = resolve
  })
  leaveDialogOpen.value = false

  if (allow) store.reset()
  return allow
})

function answerLeave(allow: boolean) {
  resolveLeave?.(allow)
  resolveLeave = null
}

const heldFileCount = computed(() => store.files.length || (store.result ? 1 : 0))

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

      <ShellConfirmDialog
        :open="leaveDialogOpen"
        :title="t('confirmLeave.title')"
        :body="t('confirmLeave.body', { count: heldFileCount })"
        :confirm-label="t('confirmLeave.confirm')"
        :cancel-label="t('confirmLeave.cancel')"
        @confirm="answerLeave(true)"
        @cancel="answerLeave(false)"
      />
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
