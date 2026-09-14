<script setup lang="ts">
import { onBeforeRouteLeave, type RouteLocationNormalized } from 'vue-router'
import {
  DEFAULT_LOCALE,
  LOCALES,
  categoryPath,
  getCategory,
  toolBySlug,
  toolPath,
  toolsInCategory,
  tools as allTools,
  type Locale,
  type ToolDef
} from '~/data/tools'
import { useFilesStore } from '~/stores/files'
import { TONES } from '~/utils/tone'

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

  return toolBySlug(category, tool, destinationLocale, import.meta.dev)
}

/**
 * A result produced here belongs to this tool again, even when the input
 * arrived as a hand-off from another one.
 */
watch(
  () => store.result,
  result => {
    if (result && store.ownerToolId === null) store.ownerToolId = props.tool.id
  }
)

onBeforeRouteLeave(async to => {
  if (!store.hasWork) return true

  // "Use as input" released the files for the next tool: leaving is the point.
  if (store.handedOff) return true

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
const tone = TONES[props.tool.category]
/** Dev only: green = published, red = draft. */
const showStatus = import.meta.dev

/**
 * The second light in the sibling list: how much of a tool Google has been
 * told about. Separate from the first because being live and being indexed
 * are different states that people otherwise conflate.
 */
function indexState(candidate: ToolDef) {
  const asked = candidate.indexed?.length ?? 0
  if (!asked) return 'bg-stone-300'
  return asked >= candidate.locales.length ? 'bg-emerald-500' : 'bg-amber-400'
}

function indexTitle(candidate: ToolDef) {
  const asked = candidate.indexed ?? []
  return asked.length ? `Indexed: ${asked.join(', ')}` : 'Not submitted to Search Console'
}

/** The rest of this category, for the sidebar — every tool page links its siblings. */
const siblings = computed(() =>
  toolsInCategory(props.tool.category, currentLocale.value, import.meta.dev)
    .filter(candidate => candidate.id !== props.tool.id)
    .slice(0, 8)
)

const howToSteps = computed(() => [
  t(`tools.${props.tool.id}.howTo.step1`),
  t(`tools.${props.tool.id}.howTo.step2`),
  t(`tools.${props.tool.id}.howTo.step3`)
])

/**
 * Up to six questions, however many the locale actually defines. vue-i18n
 * returns the key path when a message is missing, so an undefined entry is
 * dropped rather than rendered as "tools.x.faq.q5".
 */
const faqItems = computed(() =>
  [1, 2, 3, 4, 5, 6]
    .map(n => ({
      q: t(`tools.${props.tool.id}.faq.q${n}`),
      a: t(`tools.${props.tool.id}.faq.a${n}`)
    }))
    .filter(item => !item.a.startsWith(`tools.${props.tool.id}.faq.`))
)

const relatedTools = computed(() =>
  props.tool.related
    .map(id => allTools.find(candidate => candidate.id === id))
    .filter((candidate): candidate is ToolDef => !!candidate)
    .filter(candidate => candidate.published || import.meta.dev)
    .filter(candidate => !!toolPath(candidate, currentLocale.value))
)
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
    <div class="min-w-0">
      <nav aria-label="Breadcrumb" class="mb-4 text-sm text-stone-500">
        <ol class="flex flex-wrap items-center gap-1.5">
          <li>
            <NuxtLink :to="localePath('/')" class="hover:text-stone-900 hover:underline">
              {{ t('shell.breadcrumbHome') }}
            </NuxtLink>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <NuxtLink :to="categoryHref" class="hover:text-stone-900 hover:underline">
              {{ categoryName }}
            </NuxtLink>
          </li>
          <li aria-hidden="true">›</li>
          <li class="font-medium text-stone-700">{{ t(`tools.${tool.id}.name`) }}</li>
        </ol>
      </nav>

      <header class="mb-6">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <NuxtLink
            :to="categoryHref"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            :class="tone.tile"
          >
            <ShellIcon :name="category.icon" :size="14" />
            {{ categoryName }}
          </NuxtLink>
          <span
            v-if="!tool.published"
            class="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold tracking-wide text-amber-900 uppercase"
          >
            {{ t('draft.badge') }}
          </span>
        </div>
        <h1 class="text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
          {{ t(`tools.${tool.id}.name`) }}
        </h1>
        <p class="mt-2 text-base text-stone-600">{{ t(`tools.${tool.id}.short`) }}</p>
        <ShellDevStatus v-if="showStatus" :tool="tool" />
      </header>

      <!-- Tool area: above the fold, before any ad. -->
      <section class="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <slot />
      </section>

      <!-- Ads never appear between input and result. -->
      <AdsAdSlot placement="below-result" class="my-8" />

      <p class="mt-8 max-w-prose text-base leading-relaxed text-stone-700">
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
      <div class="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 class="mb-2 text-sm font-bold text-stone-950">
          {{ t('shell.allInCategory', { category: categoryName }) }}
        </h2>
        <ul class="divide-y divide-stone-100">
          <li v-for="sibling in siblings" :key="sibling.id">
            <NuxtLink
              :to="toolPath(sibling, currentLocale) ?? categoryHref"
              class="group flex items-center gap-2.5 py-2 text-sm text-stone-700 hover:text-stone-950"
            >
              <span class="flex size-7 shrink-0 items-center justify-center rounded-md" :class="tone.tile">
                <ShellIcon :name="sibling.icon" :size="14" />
              </span>
              <span class="truncate group-hover:underline">{{ t(`tools.${sibling.id}.name`) }}</span>
              <span v-if="showStatus" class="ms-auto flex shrink-0 items-center gap-1">
                <span
                  class="inline-block size-2 rounded-full"
                  :class="sibling.published ? 'bg-emerald-500' : 'bg-red-500'"
                  :title="sibling.published ? t('draft.live') : t('draft.badge')"
                />
                <span
                  class="inline-block size-2 rounded-full"
                  :class="indexState(sibling)"
                  :title="indexTitle(sibling)"
                />
              </span>
            </NuxtLink>
          </li>
        </ul>
        <NuxtLink
          :to="categoryHref"
          class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ember-700 hover:underline"
        >
          {{ categoryName }}
          <ShellIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </div>
    </aside>
  </div>
</template>
