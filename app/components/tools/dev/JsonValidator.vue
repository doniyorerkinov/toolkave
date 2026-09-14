<script setup lang="ts">
import { Check, CircleAlert } from 'lucide-vue-next'
import { parseJson } from '~~/shared/json-diff'

/**
 * Is this JSON, and if not, where does it go wrong.
 *
 * The answer people need is a line number, so that is what leads. The
 * formatted output is the consolation prize for when it was valid all along.
 */
const { t } = useI18n()
const { copied, copy } = useCopy()

const text = ref('')
const indent = ref(2)

const parsed = computed(() => (text.value.trim() ? parseJson(text.value) : null))
const valid = computed(() => !!parsed.value && parsed.value.error === null)

const output = computed(() => {
  if (!parsed.value || parsed.value.error) return ''
  return JSON.stringify(parsed.value.value, null, indent.value === 0 ? undefined : indent.value)
})

/** What was counted, once it parsed — the quick sanity check on a payload. */
const shape = computed(() => {
  if (!valid.value) return null
  const value = parsed.value!.value
  let keys = 0
  let items = 0
  let depth = 0
  const walk = (node: unknown, level: number) => {
    depth = Math.max(depth, level)
    if (Array.isArray(node)) {
      items += node.length
      for (const item of node) walk(item, level + 1)
    } else if (node && typeof node === 'object') {
      const own = Object.keys(node as Record<string, unknown>)
      keys += own.length
      for (const key of own) walk((node as Record<string, unknown>)[key], level + 1)
    }
  }
  walk(value, 1)
  return { keys, items, depth, bytes: new TextEncoder().encode(text.value).length }
})

const lines = computed(() => text.value.split('\n').length)

function loadSample() {
  text.value = '{\n  "name": "Toolkave",\n  "live": true,\n  "tools": [\n    { "id": "json-validator", "category": "dev" },\n  ]\n}'
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  text.value = await file.text()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <label class="inline-flex cursor-pointer items-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
        {{ t('json.openFile') }}
        <input type="file" accept=".json,.txt,application/json,text/plain" class="sr-only" @change="onFile" />
      </label>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="loadSample"
      >
        {{ t('json.sample') }}
      </button>
      <button
        v-if="text"
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="text = ''"
      >
        {{ t('json.clear') }}
      </button>
      <span v-if="text" class="ms-auto text-xs text-stone-500 tabular-nums">
        {{ t('json.lines', { n: lines }) }}
      </span>
    </div>

    <textarea
      v-model="text"
      rows="14"
      spellcheck="false"
      class="scroll-thin w-full rounded-xl border border-stone-300 p-3 font-mono text-sm outline-none focus:border-ember-500"
      :placeholder="t('json.placeholder')"
    />

    <div
      v-if="parsed && parsed.error"
      class="rounded-xl border border-red-200 bg-red-50 p-4"
      role="alert"
    >
      <p class="flex items-center gap-2 font-semibold text-red-900">
        <CircleAlert :size="18" aria-hidden="true" />
        {{ t('json.invalidAt', { line: parsed.error.line, column: parsed.error.column }) }}
      </p>
      <p class="mt-1 text-sm text-red-800">{{ parsed.error.message }}</p>
      <pre
        v-if="parsed.error.snippet"
        class="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white p-2 font-mono text-xs text-stone-700"
      >{{ parsed.error.snippet }}</pre>
    </div>

    <div v-else-if="valid" class="space-y-3">
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p class="flex items-center gap-2 font-semibold text-emerald-900">
          <Check :size="18" aria-hidden="true" />
          {{ t('json.valid') }}
        </p>
        <p v-if="shape" class="text-sm text-emerald-800 tabular-nums">
          {{ t('json.shape', { keys: shape.keys, items: shape.items, depth: shape.depth }) }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-stone-900">{{ t('json.indent') }}</span>
        <label
          v-for="option in [2, 4, 0]"
          :key="option"
          class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium"
          :class="
            indent === option
              ? 'border-ember-500 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
          "
        >
          <input v-model.number="indent" type="radio" :value="option" class="sr-only" />
          {{ option === 0 ? t('json.minified') : t('json.spaces', { n: option }) }}
        </label>
        <button
          type="button"
          class="ms-auto rounded-lg bg-ember-700 px-4 py-2 text-sm font-medium text-white hover:bg-ember-800"
          @click="copy(output)"
        >
          {{ copied === output ? t('colour.copied') : t('json.copyResult') }}
        </button>
      </div>

      <pre class="scroll-thin max-h-96 overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-sm text-stone-800">{{ output }}</pre>
    </div>
  </div>
</template>
