<script setup lang="ts">
/**
 * One colour in, a row of related colours out: shades and tints, a mix with a
 * second colour, or the same colour as four kinds of colour blindness see it.
 *
 * Three tools, one component, because all three are a grid of swatches over a
 * function from `shared/colour` and differ only in which function.
 */
import { mix, parseColour, readableOn, rgbToHex, shades, simulate, tints, tones, type Deficiency, type Rgb } from '~~/shared/colour'

const props = defineProps<{ mode: 'shades' | 'mix' | 'blind' }>()
const { t } = useI18n()

const base = ref('#f27d14')
const second = ref('#1e3a8a')
const amount = ref(50)
const space = ref<'oklab' | 'srgb'>('oklab')
const copied = ref('')

const a = computed(() => parseColour(base.value))
const b = computed(() => parseColour(second.value))

const DEFICIENCIES: Deficiency[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']

/** Each group is a label and the swatches under it. */
const groups = computed<{ label: string; colours: Rgb[] }[]>(() => {
  if (!a.value) return []
  if (props.mode === 'shades') {
    return [
      { label: t('colourtools.tints'), colours: tints(a.value, 9) },
      { label: t('colourtools.shades'), colours: shades(a.value, 9) },
      { label: t('colourtools.tones'), colours: tones(a.value, 9) }
    ]
  }
  if (props.mode === 'mix') {
    if (!b.value) return []
    return [{ label: t('colourtools.result'), colours: [mix(a.value, b.value, amount.value / 100, space.value)] }]
  }
  return DEFICIENCIES.map(kind => ({ label: t(`colourtools.deficiency.${kind}`), colours: [simulate(a.value!, kind)] }))
})

async function copy(hex: string) {
  await navigator.clipboard.writeText(hex)
  copied.value = hex
  setTimeout(() => (copied.value = ''), 1200)
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-4" :class="mode === 'mix' ? 'sm:grid-cols-2' : ''">
      <div>
        <label for="d-base" class="block text-sm font-medium text-stone-900">{{ t(mode === 'mix' ? 'colourtools.first' : 'colourtools.colour') }}</label>
        <div class="mt-2 flex items-center gap-2">
          <input id="d-base" v-model="base" type="text" spellcheck="false" class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm" />
          <input :value="a ? rgbToHex(a) : '#000000'" type="color" class="size-10 shrink-0 cursor-pointer rounded border border-stone-300"
            @input="base = ($event.target as HTMLInputElement).value" />
        </div>
      </div>
      <div v-if="mode === 'mix'">
        <label for="d-second" class="block text-sm font-medium text-stone-900">{{ t('colourtools.second') }}</label>
        <div class="mt-2 flex items-center gap-2">
          <input id="d-second" v-model="second" type="text" spellcheck="false" class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm" />
          <input :value="b ? rgbToHex(b) : '#000000'" type="color" class="size-10 shrink-0 cursor-pointer rounded border border-stone-300"
            @input="second = ($event.target as HTMLInputElement).value" />
        </div>
      </div>
    </div>

    <div v-if="mode === 'mix'" class="space-y-3">
      <div>
        <label for="d-amount" class="block text-sm font-medium text-stone-900">{{ t('colourtools.amount', { n: amount }) }}</label>
        <input id="d-amount" v-model.number="amount" type="range" min="0" max="100" class="mt-2 w-full accent-ember-700" />
      </div>
      <fieldset>
        <legend class="mb-2 text-sm font-medium text-stone-900">{{ t('colourtools.spaceLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label v-for="option in (['oklab', 'srgb'] as const)" :key="option" class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="space === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'">
            <input v-model="space" type="radio" :value="option" class="sr-only" />
            {{ t(`colourtools.space.${option}`) }}
          </label>
        </div>
      </fieldset>
      <p class="text-sm text-stone-500">{{ t('colourtools.spaceNote') }}</p>
    </div>

    <p v-if="!a" class="text-sm font-medium text-red-700">{{ t('colourtools.unreadable') }}</p>

    <div v-for="group in groups" :key="group.label" class="space-y-2">
      <p class="text-sm font-medium text-stone-900">{{ group.label }}</p>
      <div class="flex flex-wrap gap-2">
        <button v-for="(colour, i) in group.colours" :key="`${group.label}-${i}`" type="button"
          class="flex h-16 min-w-24 flex-1 items-end justify-center rounded-lg border border-stone-300 p-2 font-mono text-xs transition hover:scale-[1.02]"
          :style="{ backgroundColor: rgbToHex(colour), color: rgbToHex(readableOn(colour)) }"
          @click="copy(rgbToHex(colour))">
          {{ copied === rgbToHex(colour) ? t('colourtools.copied') : rgbToHex(colour) }}
        </button>
      </div>
    </div>
  </div>
</template>
