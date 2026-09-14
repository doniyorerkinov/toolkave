<script setup lang="ts">
import { categories, publishedTools, toolPath, LOCALES, type CategoryId, type Locale, type ToolDef } from '~/data/tools'
import { SITE_URL } from '~/composables/useSeo'

/**
 * A local workbench for asking Google to index pages.
 *
 * Google's URL inspection takes one address at a time and allows roughly ten
 * requests a day, so working through a 180-URL sitemap means keeping track of
 * where you got to. Doing that in your head costs you the same page twice and
 * three others never.
 *
 * Never shipped: the route is stripped from the production build, and this
 * refuses to render if it somehow gets there.
 */
if (!import.meta.dev) throw createError({ statusCode: 404, fatal: true })

definePageMeta({ layout: false })
useHead({ title: 'Indexing — local only', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

/** Search Console opens straight onto a URL if the property is named. */
const PROPERTY = 'sc-domain:toolkave.com'
const STORE_KEY = 'toolkave:indexing'
/** Google's daily allowance for manual index requests, near enough. */
const DAILY = 10

interface Row {
  key: string
  tool: ToolDef
  locale: Locale
  path: string
  url: string
  /** True when the registry already records this one as submitted. */
  committed: boolean
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  for (const tool of publishedTools()) {
    for (const locale of LOCALES) {
      const path = toolPath(tool, locale)
      if (!path) continue
      out.push({
        key: `${tool.id}:${locale}`,
        tool,
        locale,
        path,
        url: `${SITE_URL}${path}`,
        committed: !!tool.indexed?.includes(locale)
      })
    }
  }
  return out
})

/**
 * Ticked here but not yet written into the registry.
 *
 * Kept in this browser so the list can be worked through without a round
 * trip for every single URL; the registry stays the durable record.
 */
const ticked = ref<Set<string>>(new Set())

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORE_KEY)
    if (saved) ticked.value = new Set(JSON.parse(saved) as string[])
  } catch {
    // A cleared or locked-down store just means starting from the registry.
  }
})

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...ticked.value]))
  } catch {
    // Nothing to do: the ticks are still live for this session.
  }
}

function isDone(row: Row) {
  return row.committed || ticked.value.has(row.key)
}

function toggle(row: Row) {
  if (row.committed) return
  const next = new Set(ticked.value)
  if (next.has(row.key)) next.delete(row.key)
  else next.add(row.key)
  ticked.value = next
  save()
}

/**
 * Narrowing to one category first is the difference between a usable list
 * and a wall of 156 addresses: what is worth submitting today is whatever
 * went live today, not whatever happens to sit first in the registry.
 */
const category = ref<CategoryId | 'all'>('all')
const search = ref('')

const visible = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return rows.value.filter(row => {
    if (category.value !== 'all' && row.tool.category !== category.value) return false
    if (needle && !row.path.toLowerCase().includes(needle) && !row.tool.id.includes(needle)) return false
    return true
  })
})

const todo = computed(() => visible.value.filter(row => !isDone(row)))
const done = computed(() => visible.value.filter(isDone))
const batch = computed(() => todo.value.slice(0, DAILY))
/** Counts for the header, which should describe the whole site, not the filter. */
const allDone = computed(() => rows.value.filter(isDone).length)

const filter = ref<'todo' | 'done' | 'all'>('todo')
const shown = computed(() =>
  filter.value === 'todo' ? todo.value : filter.value === 'done' ? done.value : visible.value
)

const usedCategories = computed(() =>
  categories.filter(entry => rows.value.some(row => row.tool.category === entry.id))
)

function inspectUrl(url: string) {
  return `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(PROPERTY)}&id=${encodeURIComponent(url)}`
}

const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = null), 1200)
  } catch {
    copied.value = null
  }
}

/** Everything ticked since the last time the registry was updated. */
const pending = computed(() => {
  const byTool = new Map<string, Locale[]>()
  for (const row of rows.value) {
    if (row.committed || !ticked.value.has(row.key)) continue
    byTool.set(row.tool.id, [...(byTool.get(row.tool.id) ?? []), row.locale])
  }
  return [...byTool.entries()].map(([id, locales]) => `${id}: ${locales.join(', ')}`)
})

function clearTicks() {
  ticked.value = new Set()
  save()
}

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="min-h-screen bg-stone-100 p-4 sm:p-8">
    <div class="mx-auto max-w-5xl space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-stone-900">Indexing</h1>
          <p class="mt-1 text-sm text-stone-600">
            Local only — this page does not exist in production.
          </p>
        </div>
        <p class="text-sm text-stone-700 tabular-nums">
          <span class="font-semibold text-stone-900">{{ allDone }}</span> of {{ rows.length }} submitted ·
          <span class="font-semibold text-stone-900">{{ rows.length - allDone }}</span> to go
          <span v-if="rows.length - allDone" class="text-stone-500">
            · ~{{ Math.ceil((rows.length - allDone) / DAILY) }} days at {{ DAILY }} a day
          </span>
        </p>
      </header>

      <section class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="entry in [{ id: 'all' as const }, ...usedCategories]"
            :key="entry.id"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm font-medium capitalize"
            :class="
              category === entry.id
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
            @click="category = entry.id"
          >
            {{ entry.id }}
          </button>
          <input
            v-model="search"
            type="search"
            placeholder="Filter by slug…"
            class="ml-auto w-52 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>
      </section>

      <section v-if="batch.length" class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 class="text-sm font-semibold tracking-wide text-stone-500 uppercase">
          Next {{ batch.length }}<span v-if="category !== 'all'"> in {{ category }}</span>
        </h2>
        <ol class="mt-3 divide-y divide-stone-100">
          <li v-for="row in batch" :key="row.key" class="flex flex-wrap items-center gap-3 py-2.5">
            <input
              type="checkbox"
              class="size-5 shrink-0 cursor-pointer accent-ember-700"
              :checked="isDone(row)"
              :aria-label="`Mark ${row.url} as submitted`"
              @change="toggle(row)"
            />
            <span class="w-10 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-center text-xs font-medium text-stone-600 uppercase">
              {{ row.locale }}
            </span>
            <code class="min-w-0 flex-1 truncate font-mono text-sm text-stone-800">{{ row.path }}</code>
            <button
              type="button"
              class="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
              @click="copy(row.url, row.key)"
            >
              {{ copied === row.key ? 'Copied' : 'Copy URL' }}
            </button>
            <a
              :href="inspectUrl(row.url)"
              target="_blank"
              rel="noopener"
              class="shrink-0 rounded-lg bg-ember-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-ember-800"
            >
              Inspect →
            </a>
          </li>
        </ol>
        <p class="mt-3 text-xs text-stone-500">
          Inspect opens Search Console with the address already filled in — press Request indexing there,
          then tick it here. Copy URL is the fallback if the property is not
          <code class="font-mono">{{ PROPERTY }}</code>.
        </p>
      </section>

      <section v-else class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p class="text-sm font-medium text-emerald-900">
          Nothing left here<span v-if="category !== 'all' || search"> under this filter</span>.
        </p>
      </section>

      <section v-if="pending.length" class="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-amber-900">
            {{ pending.length }} tool{{ pending.length === 1 ? '' : 's' }} ticked but not yet in the registry
          </h2>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
              @click="copy(pending.join('\n'), 'pending')"
            >
              {{ copied === 'pending' ? 'Copied' : 'Copy the list' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
              @click="clearTicks"
            >
              Clear ticks
            </button>
          </div>
        </div>
        <pre class="mt-3 overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs text-stone-700">{{ pending.join('\n') }}</pre>
        <p class="mt-2 text-xs text-amber-900">
          Paste that to Claude and it goes into <code class="font-mono">app/data/tools.ts</code>, which is what
          survives clearing your browser.
        </p>
      </section>

      <section class="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center gap-2 border-b border-stone-100 p-4">
          <button
            v-for="option in (['todo', 'done', 'all'] as const)"
            :key="option"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm font-medium capitalize"
            :class="
              filter === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
            @click="filter = option"
          >
            {{ option === 'todo' ? 'To do' : option }}
            <span class="ml-1 text-xs opacity-60">
              {{ option === 'todo' ? todo.length : option === 'done' ? done.length : rows.length }}
            </span>
          </button>
        </div>

        <ul class="divide-y divide-stone-100">
          <li
            v-for="row in shown"
            :key="row.key"
            class="flex flex-wrap items-center gap-3 px-4 py-2"
            :class="isDone(row) ? 'bg-stone-50/60' : ''"
          >
            <input
              type="checkbox"
              class="size-4 shrink-0 accent-ember-700"
              :class="row.committed ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
              :checked="isDone(row)"
              :disabled="row.committed"
              :title="row.committed ? 'Recorded in the registry' : 'Tick when submitted'"
              :aria-label="`Mark ${row.url} as submitted`"
              @change="toggle(row)"
            />
            <span class="w-10 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-center text-xs font-medium text-stone-600 uppercase">
              {{ row.locale }}
            </span>
            <code
              class="min-w-0 flex-1 truncate font-mono text-sm"
              :class="isDone(row) ? 'text-stone-400 line-through' : 'text-stone-800'"
            >
              {{ row.path }}
            </code>
            <button
              type="button"
              class="shrink-0 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              @click="copy(row.url, row.key)"
            >
              {{ copied === row.key ? 'Copied' : 'Copy' }}
            </button>
            <a
              :href="inspectUrl(row.url)"
              target="_blank"
              rel="noopener"
              class="shrink-0 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Inspect
            </a>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
