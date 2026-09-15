<script setup lang="ts">
const { t } = useI18n()

const length = ref(20)
const useUpper = ref(true)
const useLower = ref(true)
const useDigits = ref(true)
const useSymbols = ref(true)
const avoidAmbiguous = ref(false)

const password = ref('')
const copied = ref(false)

const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/'
}
const AMBIGUOUS = /[Il1O0]/g

const alphabet = computed(() => {
  let chars = ''
  if (useUpper.value) chars += SETS.upper
  if (useLower.value) chars += SETS.lower
  if (useDigits.value) chars += SETS.digits
  if (useSymbols.value) chars += SETS.symbols
  return avoidAmbiguous.value ? chars.replace(AMBIGUOUS, '') : chars
})

/**
 * Uses crypto.getRandomValues, never Math.random.
 *
 * Values are rejected above the largest exact multiple of the alphabet size
 * rather than taken modulo it: plain `% n` biases toward the first characters
 * whenever 256 is not divisible by n, which it usually is not.
 */
function generate() {
  const chars = alphabet.value
  if (!chars.length) {
    password.value = ''
    return
  }

  const max = Math.floor(256 / chars.length) * chars.length
  const out: string[] = []
  const buffer = new Uint8Array(64)

  while (out.length < length.value) {
    crypto.getRandomValues(buffer)
    for (const byte of buffer) {
      if (out.length >= length.value) break
      if (byte >= max) continue
      out.push(chars[byte % chars.length]!)
    }
  }

  password.value = out.join('')
  copied.value = false
}

/** Shannon entropy of the space this password was drawn from, in bits. */
const entropyBits = computed(() => {
  if (!alphabet.value.length || !length.value) return 0
  return Math.round(length.value * Math.log2(alphabet.value.length))
})

const strengthKey = computed(() => {
  const bits = entropyBits.value
  if (bits < 50) return 'weak'
  if (bits < 80) return 'fair'
  if (bits < 120) return 'strong'
  return 'excellent'
})

const strengthClass = computed(
  () =>
    ({
      weak: 'text-red-700',
      fair: 'text-amber-700',
      strong: 'text-emerald-700',
      excellent: 'text-emerald-800'
    })[strengthKey.value]
)

async function copy() {
  if (!password.value) return
  try {
    await navigator.clipboard.writeText(password.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard access can be blocked; the field is selectable by hand.
  }
}

const noSetSelected = computed(() => alphabet.value.length === 0)

onMounted(generate)
watch([length, useUpper, useLower, useDigits, useSymbols, avoidAmbiguous], generate)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <output
        class="min-w-0 flex-1 truncate rounded-lg border border-stone-300 bg-stone-50 px-3 py-3 font-mono text-lg text-stone-900"
      >
        {{ password || '—' }}
      </output>
      <button
        type="button"
        :disabled="!password"
        class="rounded-lg bg-ember-700 px-4 py-3 text-sm font-medium text-white hover:bg-ember-800 disabled:bg-stone-300"
        @click="copy"
      >
        {{ copied ? t('wordCounter.copied') : t('wordCounter.copy') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="generate"
      >
        {{ t('password.regenerate') }}
      </button>
    </div>

    <p v-if="noSetSelected" class="text-sm text-red-700" role="alert">
      {{ t('password.noSets') }}
    </p>
    <p v-else class="text-sm">
      <span class="text-stone-600">{{ t('password.entropy', { bits: entropyBits }) }}</span>
      <span class="ms-2 font-medium" :class="strengthClass">
        {{ t(`password.strength.${strengthKey}`) }}
      </span>
    </p>

    <div>
      <label for="pw-length" class="block text-sm font-medium text-stone-900">
        {{ t('password.length', { n: length }) }}
      </label>
      <input
        id="pw-length"
        v-model.number="length"
        type="range"
        min="6"
        max="64"
        class="mt-2 w-full accent-ember-700"
      />
    </div>

    <fieldset class="grid gap-2 sm:grid-cols-2">
      <legend class="sr-only">{{ t('password.include') }}</legend>
      <label
        v-for="opt in [
          { model: 'upper', label: t('password.upper') },
          { model: 'lower', label: t('password.lower') },
          { model: 'digits', label: t('password.digits') },
          { model: 'symbols', label: t('password.symbols') }
        ]"
        :key="opt.model"
        class="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700"
      >
        <input
          v-if="opt.model === 'upper'"
          v-model="useUpper"
          type="checkbox"
          class="size-4 accent-ember-700"
        />
        <input
          v-else-if="opt.model === 'lower'"
          v-model="useLower"
          type="checkbox"
          class="size-4 accent-ember-700"
        />
        <input
          v-else-if="opt.model === 'digits'"
          v-model="useDigits"
          type="checkbox"
          class="size-4 accent-ember-700"
        />
        <input v-else v-model="useSymbols" type="checkbox" class="size-4 accent-ember-700" />
        {{ opt.label }}
      </label>
      <label
        class="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700"
      >
        <input v-model="avoidAmbiguous" type="checkbox" class="size-4 accent-ember-700" />
        {{ t('password.avoidAmbiguous') }}
      </label>
    </fieldset>
  </div>
</template>
