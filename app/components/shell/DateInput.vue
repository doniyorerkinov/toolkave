<script setup lang="ts">
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-vue-next'

/**
 * A date field that belongs to the page.
 *
 * The native control hands its calendar to the operating system, which means
 * a different look on every machine and none of them this one — and on a
 * birthday field it is worse than ugly, because reaching 1990 through a
 * month-at-a-time arrow is a hundred clicks. Here the month and the year are
 * both dropdowns, so any date is three choices away.
 *
 * Values are ISO (`YYYY-MM-DD`), the same as the native input, so nothing
 * downstream has to change. Display follows the reader's language.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    /** ISO bounds, inclusive. */
    min?: string
    max?: string
    id?: string
    ariaLabel?: string
  }>(),
  { min: undefined, max: undefined, id: undefined, ariaLabel: undefined }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { locale, t } = useI18n()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function parse(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2]) - 1
  const d = Number(match[3])
  const probe = new Date(Date.UTC(y, m, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m || probe.getUTCDate() !== d) return null
  return { y, m, d }
}

const selected = computed(() => parse(props.modelValue))
const today = new Date()

/** The month on show, which is not always the month selected. */
const view = ref({ y: selected.value?.y ?? today.getFullYear(), m: selected.value?.m ?? today.getMonth() })

watch(
  () => props.modelValue,
  () => {
    const current = selected.value
    if (current) view.value = { y: current.y, m: current.m }
  }
)

/** Month names and weekday initials, in the reader's language. */
const monthNames = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { month: 'long', timeZone: 'UTC' })
  return Array.from({ length: 12 }, (_, m) => format.format(new Date(Date.UTC(2021, m, 1))))
})

const weekdays = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
  // 2021-03-01 was a Monday, which is the first day of the week everywhere
  // this site is read.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2021, 2, 1 + i))))
})

const shown = computed(() => {
  const value = selected.value
  if (!value) return ''
  return new Intl.DateTimeFormat(locale.value, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(value.y, value.m, value.d)))
})

const minParsed = computed(() => (props.min ? parse(props.min) : null))
const maxParsed = computed(() => (props.max ? parse(props.max) : null))

/** Years offered, bounded by min and max, newest first for birthdays. */
const years = computed(() => {
  const first = minParsed.value?.y ?? today.getFullYear() - 120
  const last = maxParsed.value?.y ?? today.getFullYear() + 10
  const out: number[] = []
  for (let y = last; y >= first; y--) out.push(y)
  return out
})

function outOfRange(value: string): boolean {
  if (props.min && value < props.min) return true
  if (props.max && value > props.max) return true
  return false
}

interface Cell {
  key: string
  day: number
  iso: string
  thisMonth: boolean
  disabled: boolean
}

const grid = computed<Cell[]>(() => {
  const { y, m } = view.value
  const firstOfMonth = new Date(Date.UTC(y, m, 1))
  // Monday-first: JavaScript counts Sunday as zero.
  const lead = (firstOfMonth.getUTCDay() + 6) % 7
  const start = new Date(Date.UTC(y, m, 1 - lead))

  return Array.from({ length: 42 }, (_, i) => {
    const at = new Date(start.getTime() + i * 86400000)
    const value = iso(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
    return {
      key: value,
      day: at.getUTCDate(),
      iso: value,
      thisMonth: at.getUTCMonth() === m,
      disabled: outOfRange(value)
    }
  })
})

const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate())

function step(months: number) {
  const next = new Date(Date.UTC(view.value.y, view.value.m + months, 1))
  view.value = { y: next.getUTCFullYear(), m: next.getUTCMonth() }
}

function choose(cell: Cell) {
  if (cell.disabled) return
  emit('update:modelValue', cell.iso)
  open.value = false
  trigger.value?.focus()
}

function onPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
    trigger.value?.focus()
  }
}

watch(open, isOpen => {
  if (!import.meta.client) return
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      :id="id"
      ref="trigger"
      type="button"
      class="flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-start outline-none transition"
      :class="open ? 'border-ember-500 ring-2 ring-ember-200' : 'border-stone-300 hover:border-stone-400'"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    >
      <span :class="shown ? 'text-stone-900' : 'text-stone-500'">
        {{ shown || t('date.choose') }}
      </span>
      <Calendar :size="16" class="shrink-0 text-stone-500" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      role="dialog"
      :aria-label="ariaLabel ?? t('date.choose')"
      class="absolute z-40 mt-1 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-lg"
    >
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          :aria-label="t('date.previousMonth')"
          @click="step(-1)"
        >
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>

        <select
          v-model.number="view.m"
          class="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          :aria-label="t('date.month')"
        >
          <option v-for="(name, index) in monthNames" :key="name" :value="index">{{ name }}</option>
        </select>

        <select
          v-model.number="view.y"
          class="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          :aria-label="t('date.year')"
        >
          <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
        </select>

        <button
          type="button"
          class="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          :aria-label="t('date.nextMonth')"
          @click="step(1)"
        >
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </div>

      <div class="mt-2 grid grid-cols-7 gap-0.5 text-center">
        <abbr
          v-for="day in weekdays"
          :key="day"
          class="py-1 text-[11px] font-semibold text-stone-500 no-underline"
          :title="day"
        >
          {{ day.slice(0, 2) }}
        </abbr>

        <button
          v-for="cell in grid"
          :key="cell.key"
          type="button"
          :disabled="cell.disabled"
          class="rounded-lg py-1.5 text-sm transition"
          :class="[
            cell.iso === modelValue
              ? 'bg-ember-700 font-semibold text-white'
              : cell.disabled
                ? 'cursor-not-allowed text-stone-300'
                : cell.thisMonth
                  ? 'text-stone-800 hover:bg-ember-50'
                  : 'text-stone-500 hover:bg-stone-100',
            cell.iso === todayIso && cell.iso !== modelValue ? 'ring-1 ring-ember-400 ring-inset' : ''
          ]"
          :aria-current="cell.iso === todayIso ? 'date' : undefined"
          @click="choose(cell)"
        >
          {{ cell.day }}
        </button>
      </div>

      <div class="mt-2 flex justify-between border-t border-stone-100 pt-2">
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          @click="emit('update:modelValue', ''); open = false"
        >
          {{ t('date.clear') }}
        </button>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs font-medium text-ember-700 hover:bg-ember-50"
          :disabled="outOfRange(todayIso)"
          :class="outOfRange(todayIso) ? 'cursor-not-allowed opacity-40' : ''"
          @click="emit('update:modelValue', todayIso); open = false"
        >
          {{ t('date.today') }}
        </button>
      </div>
    </div>
  </div>
</template>
