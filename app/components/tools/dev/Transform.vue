<script setup lang="ts">
/**
 * Text in, text out: case, URL escaping, number bases and hashes.
 *
 * Four tools rather than four components, because they differ only in the
 * function applied and the controls above it. Everything else — the two
 * panes, the copy button, the empty state, the error line — would otherwise
 * be written four times and fixed in three of them.
 */
import { convertBase, decodeComponent, encodeComponent, toCase, type CaseStyle } from '~~/shared/devtools'

const props = defineProps<{ mode: 'case' | 'url' | 'base' | 'hash' }>()
const { t } = useI18n()

const input = ref('')
const style = ref<CaseStyle>('snake')
const direction = ref<'encode' | 'decode'>('encode')
const fromBase = ref('10')
const algorithm = ref<'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'>('SHA-256')
const digest = ref('')
const copied = ref(false)

const CASES: CaseStyle[] = ['camel', 'pascal', 'snake', 'kebab', 'constant', 'title', 'sentence', 'lower', 'upper']

/**
 * Hashing is the one that cannot be a computed: SubtleCrypto is async. It runs
 * on every change with no debounce because hashing a textarea's worth of text
 * is microseconds, and a debounce would only add lag to a live readout.
 */
watch([input, algorithm], async () => {
  if (props.mode !== 'hash' || !input.value) {
    digest.value = ''
    return
  }
  const bytes = new TextEncoder().encode(input.value)
  const buffer = await crypto.subtle.digest(algorithm.value, bytes)
  digest.value = [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')
})

const baseResult = computed(() => (props.mode === 'base' ? convertBase(input.value, Number(fromBase.value)) : null))

const output = computed(() => {
  if (!input.value.trim()) return ''
  if (props.mode === 'case') return toCase(input.value, style.value)
  if (props.mode === 'url') return direction.value === 'encode' ? encodeComponent(input.value) : decodeComponent(input.value).text
  if (props.mode === 'hash') return digest.value
  return baseResult.value ? baseResult.value.decimal : ''
})

const error = computed(() => {
  if (!input.value.trim()) return null
  if (props.mode === 'url' && direction.value === 'decode' && decodeComponent(input.value).error) return t('devtools.badEscape')
  if (props.mode === 'base' && !baseResult.value) return t('devtools.badDigits', { base: fromBase.value })
  return null
})

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 1400)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <template v-if="mode === 'case'">
        <label v-for="option in CASES" :key="option" class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium"
          :class="style === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'">
          <input v-model="style" type="radio" :value="option" class="sr-only" />
          {{ t(`devtools.case.${option}`) }}
        </label>
      </template>

      <template v-else-if="mode === 'url'">
        <label v-for="option in (['encode', 'decode'] as const)" :key="option" class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
          :class="direction === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'">
          <input v-model="direction" type="radio" :value="option" class="sr-only" />
          {{ t(`devtools.${option}`) }}
        </label>
      </template>

      <template v-else-if="mode === 'base'">
        <label for="from-base" class="text-sm font-medium text-stone-900">{{ t('devtools.fromBase') }}</label>
        <ShellSelect id="from-base" v-model="fromBase" class="w-40"
          :options="['2', '8', '10', '16', '36'].map(value => ({ value, label: t(`devtools.base.${value}`) }))" />
      </template>

      <template v-else>
        <label v-for="option in (['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const)" :key="option"
          class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium"
          :class="algorithm === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'">
          <input v-model="algorithm" type="radio" :value="option" class="sr-only" />
          {{ option }}
        </label>
      </template>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div>
        <label for="dev-in" class="block text-sm font-medium text-stone-900">{{ t('devtools.input') }}</label>
        <textarea id="dev-in" v-model="input" rows="10" spellcheck="false"
          class="scroll-thin mt-2 w-full rounded-lg border border-stone-300 bg-white p-3 font-mono text-sm" :placeholder="t(`devtools.placeholder.${mode}`)" />
      </div>
      <div>
        <div class="flex items-center justify-between">
          <label for="dev-out" class="block text-sm font-medium text-stone-900">{{ t('devtools.output') }}</label>
          <button v-if="output" type="button" class="rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50" @click="copy(output)">
            {{ copied ? t('devtools.copied') : t('devtools.copy') }}
          </button>
        </div>
        <textarea id="dev-out" :value="output" rows="10" readonly spellcheck="false"
          class="scroll-thin mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 p-3 font-mono text-sm break-all" />
      </div>
    </div>

    <p v-if="error" class="text-sm font-medium text-red-700">{{ error }}</p>

    <dl v-if="mode === 'base' && baseResult" class="grid gap-2 rounded-lg border border-stone-300 bg-white p-4 sm:grid-cols-2">
      <div v-for="row in [['binary', baseResult.binary], ['octal', baseResult.octal], ['decimal', baseResult.decimal], ['hex', baseResult.hex]]" :key="row[0]"
        class="flex items-baseline justify-between gap-3">
        <dt class="text-sm text-stone-500">{{ t(`devtools.base.${row[0]}`) }}</dt>
        <dd class="font-mono text-sm break-all text-stone-900">{{ row[1] }}</dd>
      </div>
    </dl>
  </div>
</template>
