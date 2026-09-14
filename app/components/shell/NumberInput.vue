<script setup lang="ts">
/**
 * A number field you can read at a glance.
 *
 * `25000000` is nine characters nobody counts correctly. Grouped into
 * `25 000 000` it is a number you recognise without moving your lips, which
 * matters most in exactly the fields where the value is largest — a loan, a
 * salary, a price in som.
 *
 * It is a text field rather than `type="number"`: a number input refuses to
 * display anything with separators in it, so the choice is a spinner or a
 * readable value. Spinners are not what anyone uses to enter a mortgage.
 * `inputmode` still brings up the numeric keypad on a phone.
 */
const props = withDefaults(
  defineProps<{
    modelValue: number | null
    /** Digits allowed after the point. Zero means whole numbers only. */
    decimals?: number
    min?: number
    max?: number
    id?: string
    placeholder?: string
    ariaLabel?: string
  }>(),
  { decimals: 0, min: undefined, max: undefined, id: undefined, placeholder: undefined, ariaLabel: undefined }
)

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const field = ref<HTMLInputElement | null>(null)
const text = ref('')

/** Matches `tidyNumber`, so what you type looks like what comes back. */
function group(value: number): string {
  return value
    .toLocaleString('en-US', { maximumFractionDigits: props.decimals })
    .replace(/,/g, ' ')
}

/**
 * Format what has been typed so far, without fighting the typist.
 *
 * A half-written number is left half-written: someone partway through
 * "1 000." has not made a mistake, and rewriting it under them is how these
 * fields become infuriating.
 */
function present(raw: string): { text: string; value: number | null } {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '.')
  if (!cleaned || cleaned === '-') return { text: cleaned, value: null }

  const negative = cleaned.startsWith('-')
  const [whole = '', ...rest] = cleaned.replace('-', '').split('.')
  const fraction = props.decimals > 0 ? rest.join('').slice(0, props.decimals) : ''
  const hadPoint = props.decimals > 0 && cleaned.includes('.')

  const digits = whole.replace(/\D/g, '')
  const groupedWhole = digits ? group(Number(digits)) : ''
  const sign = negative ? '-' : ''
  const shown = `${sign}${groupedWhole}${hadPoint ? '.' : ''}${fraction}`
  const parsed = Number(`${sign}${digits || '0'}.${fraction || '0'}`)
  return { text: shown, value: Number.isFinite(parsed) ? parsed : null }
}

/** Digits before the caret, which is the only position that survives regrouping. */
function digitsBefore(value: string, caret: number): number {
  return (value.slice(0, caret).match(/[\d.-]/g) ?? []).length
}

function caretAfter(value: string, digits: number): number {
  let seen = 0
  for (let i = 0; i < value.length; i++) {
    if (/[\d.-]/.test(value[i]!)) seen++
    if (seen === digits) return i + 1
  }
  return value.length
}

async function onInput(event: Event) {
  const el = event.target as HTMLInputElement
  const before = digitsBefore(el.value, el.selectionStart ?? el.value.length)
  const { text: shown, value } = present(el.value)
  text.value = shown
  emit('update:modelValue', value)

  // The separators move as the number grows, so the caret is put back by
  // counting digits rather than characters — otherwise it jumps to the end
  // on every thousand.
  await nextTick()
  if (field.value === document.activeElement) {
    const at = caretAfter(shown, before)
    field.value?.setSelectionRange(at, at)
  }
}

function onBlur() {
  // Tidy up on the way out: trailing points and "007" become what was meant.
  if (props.modelValue === null) {
    text.value = ''
    return
  }
  let value = props.modelValue
  if (props.min !== undefined && value < props.min) value = props.min
  if (props.max !== undefined && value > props.max) value = props.max
  if (value !== props.modelValue) emit('update:modelValue', value)
  text.value = group(value)
}

watch(
  () => props.modelValue,
  value => {
    // Only redraw when the change came from somewhere else; reformatting
    // what is being typed is the thing this component exists to avoid.
    if (present(text.value).value === value) return
    text.value = value === null ? '' : group(value)
  },
  { immediate: true }
)
</script>

<template>
  <input
    :id="id"
    ref="field"
    :value="text"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    class="w-full rounded-lg border border-stone-300 px-3 py-2 tabular-nums outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
    @input="onInput"
    @blur="onBlur"
  />
</template>
