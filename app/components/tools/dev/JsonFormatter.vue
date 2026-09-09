<script setup lang="ts">
const { t } = useI18n()

const input = ref('')
const indent = ref(2)
const sortKeys = ref(false)
const copied = ref(false)

/** Recursively sort object keys, leaving array order alone. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)])
    )
  }
  return value
}

const parsed = computed(() => {
  const text = input.value.trim()
  if (!text) return { ok: true as const, value: undefined }
  try {
    return { ok: true as const, value: JSON.parse(text) as unknown }
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) }
  }
})

const output = computed(() => {
  if (!parsed.value.ok || parsed.value.value === undefined) return ''
  const value = sortKeys.value ? sorted(parsed.value.value) : parsed.value.value
  return JSON.stringify(value, null, indent.value === 0 ? undefined : indent.value)
})

/** A quick shape summary - more useful than "valid" on its own. */
const summary = computed(() => {
  if (!parsed.value.ok || parsed.value.value === undefined) return null
  const value = parsed.value.value
  if (Array.isArray(value)) return t('json.summaryArray', { n: value.length })
  if (value && typeof value === 'object') {
    return t('json.summaryObject', { n: Object.keys(value).length })
  }
  return t('json.summaryScalar', { type: typeof value })
})

async function copy() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard can be blocked; the output stays selectable.
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-sm text-slate-700">
        {{ t('json.indent') }}
        <select
          v-model.number="indent"
          class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
        >
          <option :value="2">2</option>
          <option :value="4">4</option>
          <option :value="0">{{ t('json.minified') }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="sortKeys" type="checkbox" class="size-4 accent-sky-700" />
        {{ t('json.sortKeys') }}
      </label>
    </div>

    <div>
      <label for="json-in" class="mb-1 block text-sm font-medium text-slate-900">
        {{ t('json.inputLabel') }}
      </label>
      <textarea
        id="json-in"
        v-model="input"
        rows="8"
        spellcheck="false"
        :placeholder="t('json.placeholder')"
        class="w-full resize-y rounded-lg border p-3 font-mono text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
        :class="parsed.ok ? 'border-slate-300 focus:border-sky-500' : 'border-red-400'"
      />
      <p v-if="!parsed.ok" class="mt-1 font-mono text-sm text-red-700" role="alert">
        {{ parsed.message }}
      </p>
      <p v-else-if="summary" class="mt-1 text-sm text-emerald-700">
        {{ t('json.valid') }} — {{ summary }}
      </p>
    </div>

    <div v-if="output">
      <div class="mb-1 flex items-center justify-between">
        <label for="json-out" class="block text-sm font-medium text-slate-900">
          {{ t('json.outputLabel') }}
        </label>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          @click="copy"
        >
          {{ copied ? t('wordCounter.copied') : t('wordCounter.copy') }}
        </button>
      </div>
      <textarea
        id="json-out"
        :value="output"
        rows="10"
        readonly
        spellcheck="false"
        class="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900"
      />
    </div>
  </div>
</template>
