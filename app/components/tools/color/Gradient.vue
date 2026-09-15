<script setup lang="ts">
/**
 * A gradient, with the CSS to paste and the interpolation space made visible.
 *
 * The space is the point. A blue-to-yellow gradient in sRGB passes through a
 * muddy grey in the middle, because the straight line between them in RGB
 * dips out of the colourful part of the space. The same two colours in OKLab
 * stay saturated the whole way. Both are shown so the difference can be seen
 * rather than argued about.
 */
import { parseColour, ramp, rgbToHex } from '~~/shared/colour'

const { t } = useI18n()

const from = ref('#f27d14')
const to = ref('#1e3a8a')
const angle = ref(90)
const space = ref<'oklab' | 'srgb'>('oklab')
const copied = ref(false)

const a = computed(() => parseColour(from.value))
const b = computed(() => parseColour(to.value))

/**
 * Nine stops rather than two. A browser interpolates in sRGB whatever the
 * source colours, so writing the middle explicitly is the only way to make it
 * follow the OKLab path in every browser rather than the newest ones.
 */
const stops = computed(() => (a.value && b.value ? ramp(a.value, b.value, 9, space.value).map(rgbToHex) : []))

const css = computed(() =>
  stops.value.length ? `background: linear-gradient(${angle.value}deg, ${stops.value.join(', ')});` : ''
)

const preview = (list: string[]) => ({ backgroundImage: `linear-gradient(${angle.value}deg, ${list.join(', ')})` })

const srgbStops = computed(() => (a.value && b.value ? ramp(a.value, b.value, 9, 'srgb').map(rgbToHex) : []))
const oklabStops = computed(() => (a.value && b.value ? ramp(a.value, b.value, 9, 'oklab').map(rgbToHex) : []))

async function copy() {
  await navigator.clipboard.writeText(css.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1400)
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <div v-for="field in [['from', from], ['to', to]]" :key="field[0] as string">
        <label :for="`g-${field[0]}`" class="block text-sm font-medium text-stone-900">{{ t(`colourtools.${field[0]}`) }}</label>
        <div class="mt-2 flex items-center gap-2">
          <input :id="`g-${field[0]}`" :value="field[1]" type="text" spellcheck="false"
            class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
            @input="field[0] === 'from' ? (from = ($event.target as HTMLInputElement).value) : (to = ($event.target as HTMLInputElement).value)" />
          <input :value="field[0] === 'from' ? (a ? rgbToHex(a) : '#000000') : (b ? rgbToHex(b) : '#000000')" type="color"
            class="size-10 shrink-0 cursor-pointer rounded border border-stone-300"
            @input="field[0] === 'from' ? (from = ($event.target as HTMLInputElement).value) : (to = ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
    </div>

    <div>
      <label for="g-angle" class="block text-sm font-medium text-stone-900">{{ t('colourtools.angle', { n: angle }) }}</label>
      <input id="g-angle" v-model.number="angle" type="range" min="0" max="360" step="15" class="mt-2 w-full accent-ember-700" />
    </div>

    <div v-if="stops.length" class="space-y-4">
      <div class="h-40 rounded-xl border border-stone-300" :style="preview(stops)" />

      <fieldset>
        <legend class="mb-2 text-sm font-medium text-stone-900">{{ t('colourtools.spaceLabel') }}</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label v-for="option in (['oklab', 'srgb'] as const)" :key="option" class="cursor-pointer rounded-lg border p-3"
            :class="space === option ? 'border-ember-500 ring-2 ring-ember-200' : 'border-stone-300 hover:bg-ember-100'">
            <input v-model="space" type="radio" :value="option" class="sr-only" />
            <span class="block text-sm font-medium text-stone-900">{{ t(`colourtools.space.${option}`) }}</span>
            <span class="mt-2 block h-10 rounded" :style="preview(option === 'oklab' ? oklabStops : srgbStops)" />
          </label>
        </div>
        <p class="mt-2 text-sm text-stone-500">{{ t('colourtools.gradientNote') }}</p>
      </fieldset>

      <div>
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-stone-900">CSS</p>
          <button type="button" class="rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-ember-100" @click="copy">
            {{ copied ? t('colourtools.copied') : t('colourtools.copy') }}
          </button>
        </div>
        <pre class="scroll-thin mt-2 overflow-x-auto rounded-lg border border-stone-300 bg-stone-50 p-3 font-mono text-xs text-stone-900">{{ css }}</pre>
      </div>
    </div>
  </div>
</template>
