<script setup lang="ts">
const { t } = useI18n()

const hex = ref('#0369a1')
const copiedKey = ref('')

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  let text = value.trim().replace(/^#/, '')
  // Accept the three-digit shorthand by doubling each nibble.
  if (/^[0-9a-f]{3}$/i.test(text)) text = text.split('').map(c => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(text)) return null
  return {
    r: parseInt(text.slice(0, 2), 16),
    g: parseInt(text.slice(2, 4), 16),
    b: parseInt(text.slice(4, 6), 16)
  }
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/**
 * Relative luminance per WCAG, used for the contrast ratios below. The channel
 * values are linearised first - a plain average of R, G and B would rank
 * colours wrongly because the eye is far more sensitive to green.
 */
function luminance(r: number, g: number, b: number) {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(l1: number, l2: number) {
  const light = Math.max(l1, l2)
  const dark = Math.min(l1, l2)
  return (light + 0.05) / (dark + 0.05)
}

const rgb = computed(() => hexToRgb(hex.value))
const invalid = computed(() => !rgb.value)

const hsl = computed(() => (rgb.value ? rgbToHsl(rgb.value.r, rgb.value.g, rgb.value.b) : null))

const contrasts = computed(() => {
  if (!rgb.value) return null
  const l = luminance(rgb.value.r, rgb.value.g, rgb.value.b)
  return {
    white: contrast(l, 1).toFixed(2),
    black: contrast(l, 0).toFixed(2)
  }
})

const normalisedHex = computed(() => {
  if (!rgb.value) return ''
  const to2 = (n: number) => clamp(n).toString(16).padStart(2, '0')
  return `#${to2(rgb.value.r)}${to2(rgb.value.g)}${to2(rgb.value.b)}`.toUpperCase()
})

const values = computed(() => {
  if (!rgb.value || !hsl.value) return []
  return [
    { key: 'hex', label: 'HEX', value: normalisedHex.value },
    { key: 'rgb', label: 'RGB', value: `rgb(${rgb.value.r}, ${rgb.value.g}, ${rgb.value.b})` },
    { key: 'hsl', label: 'HSL', value: `hsl(${hsl.value.h}, ${hsl.value.s}%, ${hsl.value.l}%)` }
  ]
})

async function copy(key: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = key
    setTimeout(() => (copiedKey.value = ''), 1500)
  } catch {
    // Clipboard can be blocked; values stay selectable.
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <label for="cp-native" class="mb-1 block text-sm font-medium text-stone-900">
          {{ t('color.pick') }}
        </label>
        <input
          id="cp-native"
          :value="normalisedHex || '#000000'"
          type="color"
          class="h-14 w-24 cursor-pointer rounded-lg border border-stone-300 bg-white p-1"
          @input="hex = ($event.target as HTMLInputElement).value"
        />
      </div>

      <div class="min-w-40 flex-1">
        <label for="cp-hex" class="mb-1 block text-sm font-medium text-stone-900">
          {{ t('color.hexLabel') }}
        </label>
        <input
          id="cp-hex"
          v-model="hex"
          type="text"
          spellcheck="false"
          placeholder="#0369a1"
          class="w-full rounded-lg border px-3 py-2 font-mono text-stone-900 outline-none focus:ring-2 focus:ring-ember-200"
          :class="invalid ? 'border-red-400' : 'border-stone-300 focus:border-ember-500'"
        />
      </div>
    </div>

    <p v-if="invalid" class="text-sm text-red-700" role="alert">{{ t('color.invalid') }}</p>

    <template v-else>
      <div
        class="flex h-24 items-end rounded-lg border border-stone-200 p-3"
        :style="{ backgroundColor: normalisedHex }"
      >
        <span class="rounded bg-white/85 px-2 py-1 font-mono text-sm text-stone-900">
          {{ normalisedHex }}
        </span>
      </div>

      <dl class="grid gap-2 sm:grid-cols-3">
        <div
          v-for="item in values"
          :key="item.key"
          class="rounded-lg border border-stone-200 bg-white p-3"
        >
          <dt class="text-xs tracking-wide text-stone-500 uppercase">{{ item.label }}</dt>
          <dd class="mt-1 flex items-center justify-between gap-2">
            <span class="truncate font-mono text-sm text-stone-900">{{ item.value }}</span>
            <button
              type="button"
              class="shrink-0 rounded border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              @click="copy(item.key, item.value)"
            >
              {{ copiedKey === item.key ? t('wordCounter.copied') : t('wordCounter.copy') }}
            </button>
          </dd>
        </div>
      </dl>

      <div v-if="contrasts" class="rounded-lg border border-stone-200 bg-white p-3">
        <h3 class="text-sm font-medium text-stone-900">{{ t('color.contrast') }}</h3>
        <p class="mt-1 text-sm text-stone-600">
          {{ t('color.onWhite', { ratio: contrasts.white }) }} ·
          {{ t('color.onBlack', { ratio: contrasts.black }) }}
        </p>
        <p class="mt-1 text-xs text-stone-500">{{ t('color.wcagNote') }}</p>
      </div>
    </template>
  </div>
</template>
