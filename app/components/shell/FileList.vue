<script setup lang="ts">
import { formatBytes } from '~/utils/formatters'
import type { HeldFile } from '~/stores/files'

const props = withDefaults(defineProps<{ files: HeldFile[]; reorderable?: boolean }>(), {
  reorderable: true
})

const emit = defineEmits<{ remove: [string]; move: [number, number] }>()

const { t } = useI18n()

/**
 * Reordering is done with explicit up/down buttons rather than drag-and-drop.
 * Drag ordering is unusable on touch, which is where most of the traffic is,
 * and it is not keyboard-accessible. Drag can be layered on later for pointer
 * devices; these buttons stay as the accessible path.
 */
function move(index: number, delta: number) {
  emit('move', index, index + delta)
}
</script>

<template>
  <ul v-if="files.length" class="divide-y divide-slate-200 rounded-lg border border-slate-200">
    <li v-for="(file, index) in files" :key="file.id" class="flex items-center gap-3 p-3">
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-medium text-slate-500"
        aria-hidden="true"
      >
        {{ index + 1 }}
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-slate-900">{{ file.name }}</span>
        <span class="block text-xs text-slate-500">{{ formatBytes(file.size) }}</span>
      </span>

      <span v-if="reorderable && files.length > 1" class="flex shrink-0 gap-1">
        <button
          type="button"
          class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          :disabled="index === 0"
          :aria-label="t('fileList.moveUp', { name: file.name })"
          @click="move(index, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          :disabled="index === files.length - 1"
          :aria-label="t('fileList.moveDown', { name: file.name })"
          @click="move(index, 1)"
        >
          ↓
        </button>
      </span>

      <button
        type="button"
        class="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700"
        :aria-label="t('fileList.remove', { name: file.name })"
        @click="emit('remove', file.id)"
      >
        ✕
      </button>
    </li>
  </ul>
</template>
