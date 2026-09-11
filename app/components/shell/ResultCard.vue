<script setup lang="ts">
import { downloadBytes } from '~/utils/download'
import { formatBytes } from '~/utils/formatters'
import type { ToolResult } from '~/stores/files'

const props = withDefaults(defineProps<{ result: ToolResult; chainable?: boolean }>(), { chainable: true })
const emit = defineEmits<{ reset: []; chain: [] }>()

const { t } = useI18n()

const outSize = computed(() => props.result.data.byteLength)

const delta = computed(() => {
  if (!props.result.sourceSize) return null
  const change = ((outSize.value - props.result.sourceSize) / props.result.sourceSize) * 100
  if (Math.abs(change) < 1) return null
  return Math.round(change)
})

function download() {
  downloadBytes(props.result.data, props.result.name, props.result.type)
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
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          @click="download"
        >
          {{ t('result.download') }}
        </button>
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
  </div>
</template>
