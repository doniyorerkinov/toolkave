<script setup lang="ts">
import { Check, Circle, Copy, ExternalLink } from 'lucide-vue-next'
import { LOCALES, toolPath, type Locale, type ToolDef } from '~/data/tools'
import { SITE_URL } from '~/composables/useSeo'

/**
 * Where a tool stands, while working on it locally.
 *
 * Two separate things get confused constantly: whether a tool is live, and
 * whether Google has been told about it. They move independently — a tool
 * can be live for a week before anyone asks for it to be indexed — so they
 * get a light each rather than one combined "ready".
 *
 * Never shipped; the whole strip is behind `import.meta.dev`.
 */
const props = defineProps<{ tool: ToolDef }>()

const PROPERTY = 'sc-domain:toolkave.com'

interface Row {
  locale: Locale
  url: string
  indexed: boolean
}

const rows = computed<Row[]>(() =>
  LOCALES.map(locale => {
    const path = toolPath(props.tool, locale)
    return path
      ? { locale, url: `${SITE_URL}${path}`, indexed: !!props.tool.indexed?.includes(locale) }
      : null
  }).filter((row): row is Row => row !== null)
)

const allIndexed = computed(() => rows.value.length > 0 && rows.value.every(row => row.indexed))
const someIndexed = computed(() => rows.value.some(row => row.indexed))

function inspectUrl(url: string) {
  return `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(PROPERTY)}&id=${encodeURIComponent(url)}`
}

const copied = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (copied.value = null), 1200)
  } catch {
    copied.value = null
  }
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-xs">
    <span class="font-mono font-semibold tracking-wider text-stone-500 uppercase">dev</span>

    <span class="inline-flex items-center gap-1.5" :title="tool.published ? 'Live in production' : 'Draft — no URL in production'">
      <span class="size-2 rounded-full" :class="tool.published ? 'bg-emerald-500' : 'bg-red-500'" />
      <span class="font-medium text-stone-700">{{ tool.published ? 'Published' : 'Draft' }}</span>
    </span>

    <span
      class="inline-flex items-center gap-1.5"
      :title="allIndexed ? 'Every language submitted to Search Console' : 'Not all languages submitted'"
    >
      <span
        class="size-2 rounded-full"
        :class="allIndexed ? 'bg-emerald-500' : someIndexed ? 'bg-amber-400' : 'bg-red-500'"
      />
      <span class="font-medium text-stone-700">Indexed</span>
    </span>

    <span class="ms-auto flex flex-wrap items-center gap-1.5">
      <span
        v-for="row in rows"
        :key="row.locale"
        class="inline-flex items-center overflow-hidden rounded-md border border-stone-300 bg-white"
      >
        <span
          class="flex items-center gap-1 border-e border-stone-200 px-1.5 py-1 font-mono font-semibold uppercase"
          :class="row.indexed ? 'text-emerald-700' : 'text-stone-500'"
          :title="row.indexed ? 'Submitted to Search Console' : 'Not submitted yet'"
        >
          <Check v-if="row.indexed" :size="11" aria-hidden="true" />
          <Circle v-else :size="9" aria-hidden="true" />
          {{ row.locale }}
        </span>
        <button
          type="button"
          class="px-1.5 py-1 text-stone-500 hover:bg-ember-100 hover:text-ember-800"
          :title="`Copy ${row.url}`"
          :aria-label="`Copy the ${row.locale} URL`"
          @click="copy(row.url, row.locale)"
        >
          <Check v-if="copied === row.locale" :size="12" class="text-emerald-600" aria-hidden="true" />
          <Copy v-else :size="12" aria-hidden="true" />
        </button>
        <a
          :href="inspectUrl(row.url)"
          target="_blank"
          rel="noopener"
          class="px-1.5 py-1 text-stone-500 hover:bg-ember-100 hover:text-ember-800"
          :title="`Inspect the ${row.locale} URL in Search Console`"
        >
          <ExternalLink :size="12" aria-hidden="true" />
        </a>
      </span>
      <NuxtLink
        to="/indexing"
        class="rounded-md border border-stone-300 bg-white px-2 py-1 font-medium text-stone-600 hover:bg-ember-100 hover:text-ember-800"
      >
        All →
      </NuxtLink>
    </span>
  </div>
</template>
