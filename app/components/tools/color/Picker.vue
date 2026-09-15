<script setup lang="ts">
import { Pipette, Shuffle } from 'lucide-vue-next'
import {
  harmony,
  hsvToRgb,
  judgeContrast,
  labToLch,
  parseColour,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToLab,
  rgbToOklch,
  shades,
  tints,
  type Rgb
} from '~~/shared/colour'
import { BY_HEX } from '~~/shared/colour-names'

/**
 * Everything about one colour, on one page.
 *
 * Most sites make you visit a different page for every format. Nobody who
 * has a colour in mind wants six pages; they want the one number their tool
 * takes, and they do not always know which one that is until they see them
 * all side by side.
 */
const { t } = useI18n()
const { copied, copy } = useCopy()

const input = ref('#c2410c')
const colour = ref<Rgb>({ r: 194, g: 65, b: 12 })

/** Typing is allowed to be mid-thought: a bad value leaves the colour alone. */
watch(input, value => {
  const parsed = parseColour(value)
  if (parsed) colour.value = parsed
})

function set(next: Rgb) {
  colour.value = next
  input.value = rgbToHex(next)
}

const formats = computed(() => {
  const rgb = colour.value
  const l = rgbToHsl(rgb)
  const v = rgbToHsv(rgb)
  const c = rgbToCmyk(rgb)
  const lab = rgbToLab(rgb)
  const lch = labToLch(lab)
  const ok = rgbToOklch(rgb)
  const r0 = (n: number) => Math.round(n)
  const r1 = (n: number) => Math.round(n * 10) / 10
  const pc = (n: number) => Math.round(n * 100)
  return [
    { key: 'hex', value: rgbToHex(rgb) },
    { key: 'rgb', value: `rgb(${rgb.r} ${rgb.g} ${rgb.b})` },
    { key: 'hsl', value: `hsl(${r0(l.h)} ${pc(l.s)}% ${pc(l.l)}%)` },
    { key: 'hsv', value: `hsv(${r0(v.h)} ${pc(v.s)}% ${pc(v.v)}%)` },
    { key: 'cmyk', value: `cmyk(${pc(c.c)}% ${pc(c.m)}% ${pc(c.y)}% ${pc(c.k)}%)` },
    { key: 'lab', value: `lab(${r1(lab.l)}% ${r1(lab.a)} ${r1(lab.b)})` },
    { key: 'lch', value: `lch(${r1(lch.l)}% ${r1(lch.c)} ${r0(lch.h)})` },
    { key: 'oklch', value: `oklch(${r1(ok.l * 100)}% ${Math.round(ok.c * 1000) / 1000} ${r0(ok.h)})` }
  ]
})

const name = computed(() => BY_HEX[rgbToHex(colour.value)])
const onWhite = computed(() => judgeContrast(colour.value, { r: 255, g: 255, b: 255 }))
const onBlack = computed(() => judgeContrast(colour.value, { r: 0, g: 0, b: 0 }))

const schemes = computed(() =>
  (['complementary', 'analogous', 'triadic', 'split-complementary'] as const).map(kind => ({
    kind,
    colours: harmony(colour.value, kind)
  }))
)

const lighter = computed(() => tints(colour.value, 5).reverse())
const darker = computed(() => shades(colour.value, 5))

const eyedropper = ref(false)
onMounted(() => (eyedropper.value = canEyedrop()))

async function eyedrop() {
  const picked = await pickFromScreen()
  if (picked) set(picked)
}

function random() {
  set(hsvToRgb({ h: Math.random() * 360, s: 0.45 + Math.random() * 0.5, v: 0.5 + Math.random() * 0.45 }))
}

function onNative(event: Event) {
  const parsed = parseColour((event.target as HTMLInputElement).value)
  if (parsed) set(parsed)
}

const ratio = (value: number) => Math.round(value * 100) / 100
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <div
        class="flex min-h-40 flex-col justify-between rounded-2xl p-4 shadow-sm"
        :style="{ backgroundColor: formats[0]!.value }"
      >
        <span class="text-xs font-semibold tracking-wide uppercase opacity-70" :style="{ color: onWhite.ratio > onBlack.ratio ? '#fff' : '#000' }">
          {{ name ?? t('colour.picker.yourColour') }}
        </span>
        <span class="font-mono text-lg font-bold" :style="{ color: onWhite.ratio > onBlack.ratio ? '#fff' : '#000' }">
          {{ formats[0]!.value }}
        </span>
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <input
            :value="formats[0]!.value"
            type="color"
            class="h-11 w-14 cursor-pointer rounded-lg border border-stone-300 bg-white"
            :aria-label="t('colour.picker.pick')"
            @input="onNative"
          />
          <input
            v-model="input"
            type="text"
            spellcheck="false"
            class="min-w-40 flex-1 rounded-lg border border-stone-300 px-3 py-2.5 font-mono outline-none focus:border-ember-500"
            :placeholder="t('colour.picker.placeholder')"
            :aria-label="t('colour.picker.enter')"
          />
          <button
            v-if="eyedropper"
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
            @click="eyedrop"
          >
            <Pipette :size="16" aria-hidden="true" />
            {{ t('colour.picker.screen') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
            @click="random"
          >
            <Shuffle :size="16" aria-hidden="true" />
            {{ t('colour.picker.random') }}
          </button>
        </div>
        <p class="text-xs text-stone-500">{{ t('colour.picker.accepts') }}</p>

        <dl class="grid gap-1.5 sm:grid-cols-2">
          <div v-for="format in formats" :key="format.key" class="flex items-center gap-2">
            <dt class="w-14 shrink-0 text-xs font-semibold tracking-wide text-stone-500 uppercase">
              {{ format.key }}
            </dt>
            <dd class="min-w-0 flex-1">
              <button
                type="button"
                class="w-full truncate rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-start font-mono text-sm text-stone-800 hover:border-ember-400 hover:bg-white"
                :title="t('colour.copy')"
                @click="copy(format.value)"
              >
                {{ copied === format.value ? t('colour.copied') : format.value }}
              </button>
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <section>
      <h2 class="mb-2 text-sm font-semibold text-stone-900">{{ t('colour.picker.readability') }}</h2>
      <div class="grid gap-2 sm:grid-cols-2">
        <div
          v-for="pair in [
            { key: 'white', bg: '#ffffff', verdict: onWhite },
            { key: 'black', bg: '#000000', verdict: onBlack }
          ]"
          :key="pair.key"
          class="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3"
          :style="{ backgroundColor: pair.bg }"
        >
          <span class="text-base font-semibold" :style="{ color: formats[0]!.value }">
            {{ t('colour.picker.sample') }}
          </span>
          <span class="flex items-center gap-2 text-xs">
            <span class="font-mono font-semibold" :style="{ color: pair.key === 'white' ? '#1c1917' : '#f5f5f4' }">
              {{ ratio(pair.verdict.ratio) }}:1
            </span>
            <span
              class="rounded px-1.5 py-0.5 font-semibold"
              :class="pair.verdict.aaNormal ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'"
            >
              {{ pair.verdict.aaNormal ? 'AA' : t('colour.picker.fails') }}
            </span>
          </span>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-sm font-semibold text-stone-900">{{ t('colour.picker.lighterDarker') }}</h2>
      <div class="grid grid-cols-5 gap-1.5 sm:grid-cols-11">
        <ShellSwatch v-for="(tint, i) in lighter" :key="`t${i}`" :colour="tint" size="sm" />
        <ShellSwatch :colour="colour" size="sm" />
        <ShellSwatch v-for="(shade, i) in darker" :key="`s${i}`" :colour="shade" size="sm" />
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-sm font-semibold text-stone-900">{{ t('colour.picker.goesWith') }}</h2>
      <div class="space-y-3">
        <div v-for="scheme in schemes" :key="scheme.kind">
          <p class="mb-1 text-xs font-medium text-stone-500">
            {{ t(`colour.harmony.${scheme.kind}`) }}
          </p>
          <div class="grid gap-1.5" :style="{ gridTemplateColumns: `repeat(${scheme.colours.length}, minmax(0, 1fr))` }">
            <ShellSwatch v-for="(entry, i) in scheme.colours" :key="i" :colour="entry" size="sm" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
