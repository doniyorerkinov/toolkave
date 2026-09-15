<script setup lang="ts">
import { Check, ChevronDown, Search } from 'lucide-vue-next'

export interface SelectOption {
  value: string
  label: string
  /** Secondary text — a currency's name, a timezone's offset. */
  hint?: string
  /**
   * Extra words the search should match but nobody should have to read.
   * The time zone database says "Asia/Katmandu"; people type Kathmandu.
   */
  search?: string
}

/**
 * A dropdown the page controls.
 *
 * A native `select` renders its list by the operating system, which means it
 * cannot be styled, cannot show two lines per row, and cannot be searched —
 * fine for three options, miserable for a hundred currencies where finding
 * RON means scrolling past fifty. This is the replacement for the long ones
 * only: for a short list the native control is still better, because it is
 * the one a phone turns into a proper picker.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    ariaLabel?: string
    /** Defaults to searching once the list is long enough to need it. */
    searchable?: boolean
    align?: 'start' | 'end'
  }>(),
  { ariaLabel: undefined, searchable: undefined, align: 'start' }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()

const open = ref(false)
const query = ref('')
const active = ref(0)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLElement | null>(null)
const field = ref<HTMLInputElement | null>(null)
const listId = useId()

const canSearch = computed(() => props.searchable ?? props.options.length > 8)
const selected = computed(() => props.options.find(option => option.value === props.modelValue))

const shown = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.options
  return props.options.filter(option => {
    // Visible text matches anywhere: the reader can see why it matched.
    if (
      option.value.toLowerCase().includes(needle) ||
      option.label.toLowerCase().includes(needle) ||
      option.hint?.toLowerCase().includes(needle)
    ) {
      return true
    }
    // Hidden text matches only at the start of a word, because a match
    // nobody can see has to be explicable — "UK" should find the United
    // Kingdom, not Nuuk and Truk.
    return option.search
      ? option.search.toLowerCase().split(/[^a-z0-9]+/).some(word => word.startsWith(needle))
      : false
  })
})

function scrollActiveIntoView() {
  nextTick(() => {
    list.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })
}

async function show() {
  if (open.value) return
  open.value = true
  query.value = ''
  active.value = Math.max(0, shown.value.findIndex(option => option.value === props.modelValue))
  await nextTick()
  if (canSearch.value) field.value?.focus()
  scrollActiveIntoView()
}

function hide(focusTrigger = true) {
  if (!open.value) return
  open.value = false
  if (focusTrigger) trigger.value?.focus()
}

function choose(option: SelectOption) {
  emit('update:modelValue', option.value)
  hide()
}

function move(step: number) {
  if (!shown.value.length) return
  active.value = (active.value + step + shown.value.length) % shown.value.length
  scrollActiveIntoView()
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      show()
    }
    return
  }
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      active.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      event.preventDefault()
      active.value = shown.value.length - 1
      scrollActiveIntoView()
      break
    case 'Enter': {
      event.preventDefault()
      const option = shown.value[active.value]
      if (option) choose(option)
      break
    }
    case 'Escape':
      event.preventDefault()
      hide()
      break
    case 'Tab':
      hide(false)
      break
  }
}

// Filtering moves the ground under the highlight, so it goes back to the top.
watch(query, () => {
  active.value = 0
  scrollActiveIntoView()
})

function onPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  hide(false)
}

watch(open, isOpen => {
  if (isOpen) document.addEventListener('pointerdown', onPointerDown, true)
  else document.removeEventListener('pointerdown', onPointerDown, true)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      class="flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left outline-none transition"
      :class="open ? 'border-ember-500 ring-2 ring-ember-500/20' : 'border-stone-300 hover:border-ember-400'"
      @click="open ? hide() : show()"
      @keydown="onKeydown"
    >
      <span class="min-w-0 truncate font-medium text-stone-900">
        {{ selected?.label ?? modelValue }}
      </span>
      <ChevronDown
        :size="16"
        class="shrink-0 text-stone-500 transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="open"
      class="absolute z-30 mt-1 max-h-72 w-max min-w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg"
      :class="align === 'end' ? 'end-0' : 'start-0'"
    >
      <div v-if="canSearch" class="border-b border-stone-100 p-2">
        <div class="relative">
          <Search :size="14" class="absolute start-2.5 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <input
            ref="field"
            v-model="query"
            type="text"
            class="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 ps-8 pe-2 text-sm outline-none focus:border-ember-400 focus:bg-white"
            :placeholder="t('select.search')"
            :aria-controls="listId"
            @keydown="onKeydown"
          />
        </div>
      </div>

      <ul
        :id="listId"
        ref="list"
        role="listbox"
        :aria-label="ariaLabel"
        class="scroll-thin max-h-56 overflow-y-auto py-1"
      >
        <li
          v-for="(option, index) in shown"
          :key="option.value"
          role="option"
          :aria-selected="option.value === modelValue"
          :data-active="index === active"
          class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
          :class="[
            index === active ? 'bg-ember-50' : '',
            option.value === modelValue ? 'font-semibold text-ember-900' : 'text-stone-800'
          ]"
          @pointerenter="active = index"
          @click="choose(option)"
        >
          <Check
            :size="14"
            class="shrink-0"
            :class="option.value === modelValue ? 'text-ember-700' : 'invisible'"
            aria-hidden="true"
          />
          <span class="font-medium">{{ option.label }}</span>
          <span v-if="option.hint" class="ms-auto truncate ps-3 text-xs text-stone-500">
            {{ option.hint }}
          </span>
        </li>
        <li v-if="!shown.length" class="px-3 py-4 text-center text-sm text-stone-500">
          {{ t('select.noMatch') }}
        </li>
      </ul>
    </div>
  </div>
</template>
