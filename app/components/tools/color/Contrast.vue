<script setup lang="ts">
/**
 * Two colours and a verdict, with the fix offered rather than described.
 *
 * Most contrast checkers stop at "fails AA". The useful part is the next step:
 * how far the foreground has to move to pass. Walking the lightness in OKLCH
 * keeps the hue while the lightness changes, so the suggestion is recognisably
 * the same colour rather than a different one.
 */
import { contrast, judgeContrast, parseColour, rgbToHex, rgbToOklch, oklchToRgb, type Rgb } from '~~/shared/colour'

const { t } = useI18n()
const foreground = ref('#78716c')
const background = ref('#ffffff')

const fg = computed(() => parseColour(foreground.value))
const bg = computed(() => parseColour(background.value))
const verdict = computed(() => (fg.value && bg.value ? judgeContrast(fg.value, bg.value) : null))

/**
 * The nearest lightness that passes, in one direction or the other.
 *
 * Searched rather than calculated: contrast is not linear in lightness, and a
 * hundred steps of 1% is instant and exact enough to land on the first value
 * that clears the bar.
 */
function nearestPassing(target: number): Rgb | null {
  if (!fg.value || !bg.value) return null
  const start = rgbToOklch(fg.value)
  const backgroundIsLight = contrast({ r: 255, g: 255, b: 255 }, bg.value) < 2

  for (let step = 1; step <= 100; step++) {
    const move = step / 100
    const candidate = oklchToRgb({ ...start, l: backgroundIsLight ? Math.max(0, start.l - move) : Math.min(1, start.l + move) })
    if (contrast(candidate, bg.value) >= target) return candidate
  }
  return null
}

const suggestion = computed(() => (verdict.value && !verdict.value.aaNormal ? nearestPassing(4.5) : null))
const swap = () => ([foreground.value, background.value] = [background.value, foreground.value])
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div v-for="field in [['foreground', foreground], ['background', background]]" :key="field[0] as string">
        <label :for="`c-${field[0]}`" class="block text-sm font-medium text-stone-900">{{ t(`colourtools.${field[0]}`) }}</label>
        <div class="mt-2 flex items-center gap-2">
          <input :id="`c-${field[0]}`" :value="field[1]" type="text" spellcheck="false"
            class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
            @input="field[0] === 'foreground' ? (foreground = ($event.target as HTMLInputElement).value) : (background = ($event.target as HTMLInputElement).value)" />
          <input :value="field[0] === 'foreground' ? (fg ? rgbToHex(fg) : '#000000') : (bg ? rgbToHex(bg) : '#ffffff')" type="color"
            class="size-10 shrink-0 cursor-pointer rounded border border-stone-300"
            @input="field[0] === 'foreground' ? (foreground = ($event.target as HTMLInputElement).value) : (background = ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
    </div>

    <button type="button" class="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100" @click="swap">
      {{ t('colourtools.swap') }}
    </button>

    <div v-if="verdict && fg && bg" class="space-y-4">
      <div class="rounded-xl border border-stone-300 p-6" :style="{ backgroundColor: rgbToHex(bg), color: rgbToHex(fg) }">
        <p class="text-2xl font-bold">{{ t('colourtools.sampleLarge') }}</p>
        <p class="mt-2 text-sm">{{ t('colourtools.sampleSmall') }}</p>
      </div>

      <div class="rounded-lg border border-stone-300 bg-white p-4">
        <p class="text-3xl font-bold text-stone-900">{{ verdict.ratio.toFixed(2) }}<span class="text-lg font-normal text-stone-500">:1</span></p>
        <dl class="mt-3 grid gap-2 sm:grid-cols-2">
          <div v-for="level in [['AA', verdict.aaNormal], ['AAA', verdict.aaaNormal], ['AA Large', verdict.aaLarge], ['UI & icons', verdict.uiComponents]]" :key="level[0] as string"
            class="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold"
            :class="level[1] ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'">
            <dt>{{ level[0] }}</dt>
            <dd>{{ level[1] ? t('colourtools.pass') : t('colourtools.fail') }}</dd>
          </div>
        </dl>
      </div>

      <div v-if="suggestion" class="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p class="text-sm text-amber-900">{{ t('colourtools.suggestion') }}</p>
        <button type="button" class="mt-2 flex items-center gap-3 rounded-lg border border-amber-300 bg-white px-3 py-2"
          @click="foreground = rgbToHex(suggestion!)">
          <span class="size-8 rounded border border-stone-300" :style="{ backgroundColor: rgbToHex(suggestion) }" />
          <span class="font-mono text-sm text-stone-900">{{ rgbToHex(suggestion) }}</span>
          <span class="text-xs text-stone-500">{{ contrast(suggestion, bg).toFixed(2) }}:1</span>
        </button>
      </div>
    </div>
  </div>
</template>
