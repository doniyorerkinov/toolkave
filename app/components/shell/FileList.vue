<script setup lang="ts">
import { formatBytes } from '~/utils/formatters'
import type { HeldFile } from '~/stores/files'

const props = withDefaults(defineProps<{ files: HeldFile[]; reorderable?: boolean }>(), {
  reorderable: true
})

const emit = defineEmits<{ remove: [string]; move: [number, number] }>()

const { t } = useI18n()

const listEl = ref<HTMLElement | null>(null)
const handles = ref<HTMLElement[]>([])
const dragIndex = ref<number | null>(null)

/**
 * Reordering uses Pointer Events rather than HTML5 drag-and-drop: HTML5 drag
 * does not fire on touch devices, and most of this site's traffic is mobile.
 * Pointer events give one code path for mouse, touch and pen.
 *
 * The handle is also focusable and responds to arrow keys, so reordering stays
 * possible without a pointer at all.
 */
function rowRects(): DOMRect[] {
  if (!listEl.value) return []
  return [...listEl.value.querySelectorAll('[data-row]')].map(el => el.getBoundingClientRect())
}

function indexAt(clientY: number): number | null {
  const rects = rowRects()
  if (!rects.length) return null
  if (clientY <= (rects[0]?.top ?? 0)) return 0
  if (clientY >= (rects[rects.length - 1]?.bottom ?? 0)) return rects.length - 1
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (r && clientY >= r.top && clientY <= r.bottom) return i
  }
  return null
}

function onPointerDown(event: PointerEvent, index: number) {
  if (!props.reorderable || props.files.length < 2) return
  // Ignore secondary buttons so right-click does not start a drag.
  if (event.button !== 0 && event.pointerType === 'mouse') return
  dragIndex.value = index
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (dragIndex.value === null) return
  const target = indexAt(event.clientY)
  if (target === null || target === dragIndex.value) return
  // Live reorder as the pointer crosses rows, so the list shows the result
  // directly instead of a separate drop indicator.
  emit('move', dragIndex.value, target)
  dragIndex.value = target
}

function onPointerUp(event: PointerEvent) {
  if (dragIndex.value === null) return
  const el = event.currentTarget as HTMLElement
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
  dragIndex.value = null
}

async function onKeydown(event: KeyboardEvent, index: number) {
  if (!props.reorderable || props.files.length < 2) return
  const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!delta) return

  const target = index + delta
  if (target < 0 || target >= props.files.length) return

  event.preventDefault()
  emit('move', index, target)

  // Keep focus on the same file after it moves, so repeated presses work.
  await nextTick()
  handles.value[target]?.focus()
}
</script>

<template>
  <ul
    v-if="files.length"
    ref="listEl"
    class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white"
  >
    <li
      v-for="(file, index) in files"
      :key="file.id"
      data-row
      class="flex items-center gap-3 p-3 transition-colors"
      :class="dragIndex === index ? 'bg-sky-50' : ''"
    >
      <button
        v-if="reorderable && files.length > 1"
        :ref="el => { if (el) handles[index] = el as HTMLElement }"
        type="button"
        class="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:ring-2 focus:ring-sky-400 focus:outline-none active:cursor-grabbing"
        :aria-label="
          t('fileList.reorder', { name: file.name, position: index + 1, total: files.length })
        "
        @pointerdown="onPointerDown($event, index)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onKeydown($event, index)"
      >
        <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true" fill="currentColor">
          <circle cx="6" cy="3" r="1.3" />
          <circle cx="10" cy="3" r="1.3" />
          <circle cx="6" cy="8" r="1.3" />
          <circle cx="10" cy="8" r="1.3" />
          <circle cx="6" cy="13" r="1.3" />
          <circle cx="10" cy="13" r="1.3" />
        </svg>
      </button>

      <span
        v-else
        class="flex size-9 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-medium text-slate-500"
        aria-hidden="true"
      >
        {{ index + 1 }}
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-slate-900">
          <span v-if="reorderable && files.length > 1" class="text-slate-400">{{ index + 1 }}.</span>
          {{ file.name }}
        </span>
        <span class="block text-xs text-slate-500">{{ formatBytes(file.size) }}</span>
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

  <p v-if="reorderable && files.length > 1" class="mt-2 text-xs text-slate-500">
    {{ t('fileList.dragHint') }}
  </p>
</template>
