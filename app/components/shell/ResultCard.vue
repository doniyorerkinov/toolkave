<script setup lang="ts">
import { toolPath, tools, type Locale, type ToolDef } from '~/data/tools'
import { TONES } from '~/utils/tone'
import { downloadBytes } from '~/utils/download'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore, type ToolResult } from '~/stores/files'

const props = withDefaults(defineProps<{ result: ToolResult; chainable?: boolean }>(), { chainable: true })
const emit = defineEmits<{ reset: []; chain: [] }>()

const { t, locale } = useI18n()
const store = useFilesStore()
const router = useRouter()
const currentLocale = computed(() => locale.value as Locale)

const outSize = computed(() => props.result.data.byteLength)

const delta = computed(() => {
  if (!props.result.sourceSize) return null
  const change = ((outSize.value - props.result.sourceSize) / props.result.sourceSize) * 100
  if (Math.abs(change) < 1) return null
  return Math.round(change)
})

/**
 * Inside Telegram's webview an anchor download is ignored without complaining,
 * so `downloadBytes` says what it managed. When there is no route left the
 * button must admit it rather than look like it worked.
 */
const undelivered = ref(false)

async function download() {
  undelivered.value = false
  const result = await downloadBytes(props.result.data, props.result.name, props.result.type)
  undelivered.value = result === 'unavailable'
}

/**
 * Where this file can go next. Matched on the result's MIME type against the
 * registry's `acceptedTypes`, so every suggestion is a tool that can actually
 * take the file: a merged PDF offers Split and Compress, a JPG offers "JPG to
 * PDF" and Resize. The current tool's curated `related` list comes first,
 * then the rest of its category, then everything else, capped at four.
 */
/** A PDF past this is worth a nudge towards Compress before anything else. */
const LARGE_PDF = 2 * 1024 * 1024
const isLargePdf = computed(() => props.result.type === 'application/pdf' && outSize.value > LARGE_PDF)

const nextTools = computed(() => {
  if (!props.chainable) return []
  const mime = props.result.type.split(';')[0]
  const current = tools.find(candidate => candidate.id === store.ownerToolId)
  const rank = (tool: ToolDef) =>
    isLargePdf.value && tool.id === 'pdf-compress' ? -1
      : current?.related.includes(tool.id) ? 0 : tool.category === current?.category ? 1 : 2
  return tools
    .filter(tool => tool.id !== current?.id && !!mime && tool.acceptedTypes?.includes(mime))
    .filter(tool => (tool.published || import.meta.dev) && !!toolPath(tool, currentLocale.value))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 4)
})

/** Hand the result to another tool: it arrives there as the input, no re-upload. */
function continueWith(tool: ToolDef) {
  const path = toolPath(tool, currentLocale.value)
  if (!path) return
  store.chainResult()
  router.push(path)
}
</script>

<template>
  <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate font-medium text-emerald-900">{{ result.name }}</p>
        <p class="mt-0.5 text-sm text-emerald-800">
          {{ formatBytes(result.sourceSize) }} → {{ formatBytes(outSize) }}
          <span v-if="delta !== null" class="text-emerald-700">
            ({{ delta > 0 ? '+' : '' }}{{ delta }}%)
          </span>
        </p>
        <p v-if="result.note" class="mt-0.5 text-sm font-medium text-emerald-900">{{ result.note }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          @click="download"
        >
          {{ t('result.download') }}
        </button>
        <p v-if="undelivered" class="w-full text-sm font-medium text-red-700">
          {{ t('result.undelivered') }}
        </p>
        <button
          v-if="chainable"
          type="button"
          class="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
          @click="emit('chain')"
        >
          {{ t('result.useAsInput') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          @click="emit('reset')"
        >
          {{ t('result.startOver') }}
        </button>
      </div>
    </div>

    <div v-if="nextTools.length" class="mt-4 border-t border-emerald-200 pt-3">
      <p class="text-xs font-semibold tracking-wide text-emerald-800 uppercase">{{ t('result.next') }}</p>
      <p v-if="isLargePdf && nextTools.some(tool => tool.id === 'pdf-compress')" class="mt-1 text-sm text-emerald-900">
        {{ t('result.large', { size: formatBytes(outSize), tool: t('tools.pdf-compress.name') }) }}
      </p>
      <ul class="mt-2 flex flex-wrap gap-2">
        <li v-for="tool in nextTools" :key="tool.id">
          <button
            type="button"
            class="group inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white py-1.5 ps-1.5 pe-3 text-sm font-medium text-stone-800 transition hover:border-ember-400 hover:shadow-sm"
            @click="continueWith(tool)"
          >
            <span class="flex size-6 items-center justify-center rounded-md" :class="TONES[tool.category].tile">
              <ShellIcon :name="tool.icon" :size="14" />
            </span>
            {{ t(`tools.${tool.id}.name`) }}
            <ShellIcon name="arrow-right" :size="14" class="text-stone-400 transition group-hover:text-ember-600" />
          </button>
        </li>
      </ul>
    </div>

    <ShellResultPreview :result="result" />
  </div>
</template>
