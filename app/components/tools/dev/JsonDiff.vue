<script setup lang="ts">
import { ArrowRight, CircleAlert, Minus, Plus } from 'lucide-vue-next'
import { diffJson, parseJson, type Change } from '~~/shared/json-diff'

/**
 * How alike are these two documents, and exactly where do they part company.
 *
 * A line diff on JSON is mostly noise — reformatting and key order drown the
 * one value that actually changed — so this compares meaning and reports
 * paths. The similarity score answers the question people usually arrive
 * with, which is not "what changed" but "are these the same".
 */
const { t } = useI18n()
const { copied, copy } = useCopy()

const left = ref('')
const right = ref('')
const filter = ref<'all' | 'changed' | 'added' | 'removed'>('all')

const leftParsed = computed(() => (left.value.trim() ? parseJson(left.value) : null))
const rightParsed = computed(() => (right.value.trim() ? parseJson(right.value) : null))
const leftError = computed(() => leftParsed.value?.error ?? null)
const rightError = computed(() => rightParsed.value?.error ?? null)

const ready = computed(() => !!leftParsed.value && !!rightParsed.value && !leftError.value && !rightError.value)

const result = computed(() => {
  if (!ready.value) return null
  return diffJson(leftParsed.value!.value, rightParsed.value!.value)
})

const percent = computed(() => (result.value ? Math.round(result.value.similarity * 1000) / 10 : 0))

const counts = computed(() => {
  const out = { changed: 0, added: 0, removed: 0 }
  for (const change of result.value?.changes ?? []) out[change.kind]++
  return out
})

const shown = computed(() =>
  (result.value?.changes ?? []).filter(change => filter.value === 'all' || change.kind === filter.value)
)

/** Values are shown as JSON so a string and a number never look the same. */
function show(value: unknown): string {
  if (value === undefined) return '—'
  const text = JSON.stringify(value)
  if (text === undefined) return String(value)
  return text.length > 120 ? text.slice(0, 120) + '…' : text
}

const report = computed(() => {
  if (!result.value) return ''
  const head = t('jsonDiff.reportHead', { percent: percent.value, n: result.value.changes.length })
  const body = result.value.changes.map(change => {
    const line = change.kind.padEnd(8) + ' ' + change.path
    return change.kind === 'changed' ? line + '  ' + show(change.left) + ' -> ' + show(change.right) : line
  })
  return [head, ...body].join('\n')
})

const tone: Record<Change['kind'], string> = {
  added: 'bg-emerald-50 text-emerald-900',
  removed: 'bg-red-50 text-red-900',
  changed: 'bg-amber-50 text-amber-900'
}

function swap() {
  const previous = left.value
  left.value = right.value
  right.value = previous
}

function clearBoth() {
  left.value = ''
  right.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 lg:grid-cols-2">
      <div class="space-y-1.5">
        <label for="json-left" class="block text-sm font-medium text-stone-900">{{ t('jsonDiff.left') }}</label>
        <textarea
          id="json-left"
          v-model="left"
          rows="12"
          spellcheck="false"
          class="scroll-thin w-full rounded-xl border p-3 font-mono text-sm outline-none focus:border-ember-500"
          :class="leftError ? 'border-red-300 bg-red-50/40' : 'border-stone-300'"
          :placeholder="t('json.placeholder')"
        />
        <p v-if="leftError" class="flex items-center gap-1.5 text-sm text-red-700" role="alert">
          <CircleAlert :size="15" aria-hidden="true" />
          {{ t('json.invalidAt', { line: leftError.line, column: leftError.column }) }} — {{ leftError.message }}
        </p>
      </div>

      <div class="space-y-1.5">
        <label for="json-right" class="block text-sm font-medium text-stone-900">{{ t('jsonDiff.right') }}</label>
        <textarea
          id="json-right"
          v-model="right"
          rows="12"
          spellcheck="false"
          class="scroll-thin w-full rounded-xl border p-3 font-mono text-sm outline-none focus:border-ember-500"
          :class="rightError ? 'border-red-300 bg-red-50/40' : 'border-stone-300'"
          :placeholder="t('json.placeholder')"
        />
        <p v-if="rightError" class="flex items-center gap-1.5 text-sm text-red-700" role="alert">
          <CircleAlert :size="15" aria-hidden="true" />
          {{ t('json.invalidAt', { line: rightError.line, column: rightError.column }) }} — {{ rightError.message }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="swap"
      >
        {{ t('jsonDiff.swap') }}
      </button>
      <button
        v-if="left || right"
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="clearBoth"
      >
        {{ t('json.clear') }}
      </button>
    </div>

    <template v-if="result">
      <div class="rounded-xl border border-stone-200 bg-white p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <p class="text-sm font-medium text-stone-900">{{ t('jsonDiff.similarity') }}</p>
          <p class="text-2xl font-bold tabular-nums" :class="percent === 100 ? 'text-emerald-700' : 'text-stone-900'">
            {{ percent }}%
          </p>
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            class="h-full rounded-full transition-[width]"
            :class="percent === 100 ? 'bg-emerald-500' : 'bg-ember-600'"
            :style="{ width: percent + '%' }"
          />
        </div>
        <p class="mt-2 text-sm text-stone-600">
          {{
            result.changes.length
              ? t('jsonDiff.summary', { changed: counts.changed, added: counts.added, removed: counts.removed })
              : t('jsonDiff.identical')
          }}
        </p>
      </div>

      <div v-if="result.changes.length" class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="option in (['all', 'changed', 'added', 'removed'] as const)"
            :key="option"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm font-medium"
            :class="
              filter === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
            @click="filter = option"
          >
            {{ t(`jsonDiff.filter.${option}`) }}
            <span class="ml-1 text-xs opacity-60">
              {{ option === 'all' ? result.changes.length : counts[option] }}
            </span>
          </button>
          <button
            type="button"
            class="ms-auto rounded-lg bg-ember-700 px-4 py-2 text-sm font-medium text-white hover:bg-ember-800"
            @click="copy(report)"
          >
            {{ copied === report ? t('colour.copied') : t('jsonDiff.copyReport') }}
          </button>
        </div>

        <ul class="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
          <li v-for="change in shown" :key="change.kind + change.path" class="p-3" :class="tone[change.kind]">
            <p class="flex items-center gap-2 font-mono text-sm font-semibold">
              <Plus v-if="change.kind === 'added'" :size="14" aria-hidden="true" />
              <Minus v-else-if="change.kind === 'removed'" :size="14" aria-hidden="true" />
              <ArrowRight v-else :size="14" aria-hidden="true" />
              {{ change.path }}
            </p>
            <p v-if="change.kind === 'changed'" class="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span class="rounded bg-white/70 px-1.5 py-0.5">{{ show(change.left) }}</span>
              <ArrowRight :size="12" aria-hidden="true" />
              <span class="rounded bg-white/70 px-1.5 py-0.5">{{ show(change.right) }}</span>
            </p>
            <p v-else class="mt-1 font-mono text-xs">
              <span class="rounded bg-white/70 px-1.5 py-0.5">
                {{ show(change.kind === 'added' ? change.right : change.left) }}
              </span>
            </p>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
