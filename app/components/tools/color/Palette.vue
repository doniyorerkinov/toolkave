<script setup lang="ts">
import { Copy, Lock, LockOpen, RefreshCw, TriangleAlert, X } from 'lucide-vue-next'
import {
  confusablePairs,
  generatePalette,
  parseColour,
  readableOn,
  rgbToHex,
  rgbToOklch,
  shades,
  tints,
  type PaletteMode,
  type Rgb
} from '~~/shared/colour'
import { BY_HEX } from '~~/shared/colour-names'

/**
 * Five colours that go together, and the space bar to try again.
 *
 * The interaction people already know: lock the ones you like, reroll the
 * rest. What is added is the part the well-known generators leave out — a
 * palette is not finished when it looks nice, it is finished when text can
 * sit on it and when two of its colours are not the same colour to a tenth
 * of the men who will see it.
 */
const { t } = useI18n()
const { copied, copy } = useCopy()

const MODES: PaletteMode[] = [
  'auto',
  'analogous',
  'monochromatic',
  'complementary',
  'split-complementary',
  'triadic',
  'square'
]

const mode = ref<PaletteMode>('auto')
const colours = ref<Rgb[]>([])
const locks = ref<boolean[]>([false, false, false, false, false])
const open = ref<number | null>(null)

function roll() {
  const locked = colours.value.map((entry, i) => (locks.value[i] ? entry : null))
  colours.value = generatePalette(mode.value, 5, colours.value.length ? locked : [])
  writeHash()
}

/**
 * The palette lives in the address bar.
 *
 * It costs nothing and it is the only way to send someone a palette without
 * an account, which is what every generator that asks you to sign up is
 * really selling.
 */
function writeHash() {
  if (!import.meta.client) return
  const hash = colours.value.map(entry => rgbToHex(entry).slice(1)).join('-')
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${hash}`)
}

function readHash(): Rgb[] | null {
  if (!import.meta.client) return null
  const parts = location.hash.replace('#', '').split('-').filter(Boolean)
  if (parts.length < 2 || parts.length > 8) return null
  const parsed = parts.map(part => parseColour(`#${part}`))
  return parsed.every((entry): entry is Rgb => entry !== null) ? parsed : null
}

function applyHash(): boolean {
  const shared = readHash()
  if (!shared) return false
  colours.value = shared
  locks.value = shared.map(() => false)
  open.value = null
  return true
}

/**
 * Someone pasting a shared link while already here changes only the hash,
 * which is a same-document navigation — the component never remounts, so
 * without this the page would sit there showing the old palette. Our own
 * writes use replaceState, which fires nothing, so this only ever responds
 * to a person.
 */
function onHashChange() {
  applyHash()
}

onMounted(() => {
  if (!applyHash()) roll()
  window.addEventListener('keydown', onKey)
  window.addEventListener('hashchange', onHashChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('hashchange', onHashChange)
})

function onKey(event: KeyboardEvent) {
  if (event.code !== 'Space') return
  const target = event.target
  // Never steal the space bar from something being typed in.
  if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (target instanceof HTMLElement && target.isContentEditable) return
  event.preventDefault()
  roll()
}

function toggleLock(index: number) {
  locks.value = locks.value.map((value, i) => (i === index ? !value : value))
}

function replace(index: number, value: string) {
  const parsed = parseColour(value)
  if (!parsed) return
  colours.value = colours.value.map((entry, i) => (i === index ? parsed : entry))
  writeHash()
}

function remove(index: number) {
  if (colours.value.length <= 2) return
  colours.value = colours.value.filter((_, i) => i !== index)
  locks.value = locks.value.filter((_, i) => i !== index)
  if (open.value === index) open.value = null
  writeHash()
}

const ink = (entry: Rgb) => rgbToHex(readableOn(entry))
const nameOf = (entry: Rgb) => BY_HEX[rgbToHex(entry)]

/** Which pairs a deuteranope would read as the same colour. */
const confusable = computed(() => confusablePairs(colours.value))
const confusableSet = computed(() => new Set(confusable.value.flat()))

const variants = computed(() => {
  if (open.value === null) return null
  const base = colours.value[open.value]
  if (!base) return null
  return { lighter: tints(base, 4).reverse(), darker: shades(base, 4), lch: rgbToOklch(base) }
})

const exports = computed(() => {
  const hexes = colours.value.map(entry => rgbToHex(entry))
  return [
    { key: 'hex', value: hexes.join(', ') },
    { key: 'css', value: `:root {\n${hexes.map((hex, i) => `  --colour-${i + 1}: ${hex};`).join('\n')}\n}` },
    { key: 'scss', value: hexes.map((hex, i) => `$colour-${i + 1}: ${hex};`).join('\n') },
    {
      key: 'tailwind',
      value: `colors: {\n${hexes.map((hex, i) => `  brand${i === 0 ? '' : i + 1}: '${hex}',`).join('\n')}\n}`
    },
    { key: 'json', value: JSON.stringify(hexes, null, 2) }
  ]
})

const shareUrl = computed(() => {
  if (!import.meta.client) return ''
  return `${location.origin}${location.pathname}#${colours.value.map(entry => rgbToHex(entry).slice(1)).join('-')}`
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg bg-ember-700 px-4 py-2.5 font-medium text-white hover:bg-ember-800"
        @click="roll"
      >
        <RefreshCw :size="17" aria-hidden="true" />
        {{ t('colour.palette.generate') }}
      </button>
      <span class="hidden text-xs text-stone-500 sm:inline">{{ t('colour.palette.spaceHint') }}</span>

      <div class="ms-auto flex flex-wrap items-center gap-1.5">
        <label
          v-for="option in MODES"
          :key="option"
          class="cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          :class="
            mode === option
              ? 'border-ember-500 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-600 hover:bg-ember-100'
          "
        >
          <input v-model="mode" type="radio" :value="option" class="sr-only" />
          {{ t(`colour.palette.mode.${option}`) }}
        </label>
      </div>
    </div>

    <div class="grid overflow-hidden rounded-2xl shadow-sm" :style="{ gridTemplateColumns: `repeat(${colours.length}, minmax(0, 1fr))` }">
      <div
        v-for="(entry, index) in colours"
        :key="index"
        class="group relative flex min-h-52 flex-col justify-between p-3 transition sm:min-h-72"
        :style="{ backgroundColor: rgbToHex(entry), color: ink(entry) }"
      >
        <div class="flex items-start justify-between gap-1">
          <button
            type="button"
            class="rounded-lg p-1.5 transition hover:bg-black/10"
            :aria-pressed="locks[index]"
            :title="locks[index] ? t('colour.palette.unlock') : t('colour.palette.lock')"
            @click="toggleLock(index)"
          >
            <Lock v-if="locks[index]" :size="17" aria-hidden="true" />
            <LockOpen v-else :size="17" class="opacity-40 group-hover:opacity-90" aria-hidden="true" />
          </button>
          <button
            v-if="colours.length > 2"
            type="button"
            class="rounded-lg p-1.5 opacity-0 transition group-hover:opacity-60 hover:bg-black/10 hover:opacity-100 focus:opacity-100"
            :title="t('colour.palette.remove')"
            @click="remove(index)"
          >
            <X :size="16" aria-hidden="true" />
          </button>
        </div>

        <div class="space-y-1">
          <button
            type="button"
            class="block w-full text-start font-mono text-base font-bold tracking-wide uppercase"
            :title="t('colour.copy')"
            @click="copy(rgbToHex(entry))"
          >
            {{ copied === rgbToHex(entry) ? t('colour.copied') : rgbToHex(entry).slice(1) }}
          </button>
          <p v-if="nameOf(entry)" class="text-xs opacity-70">{{ nameOf(entry) }}</p>
          <p
            v-if="confusableSet.has(index)"
            class="flex items-center gap-1 text-xs opacity-80"
            :title="t('colour.palette.confusableTitle')"
          >
            <TriangleAlert :size="12" aria-hidden="true" />
            {{ t('colour.palette.confusableShort') }}
          </p>
          <button
            type="button"
            class="text-xs underline underline-offset-2 opacity-60 hover:opacity-100"
            @click="open = open === index ? null : index"
          >
            {{ open === index ? t('colour.palette.hideShades') : t('colour.palette.showShades') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="variants && open !== null" class="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-semibold text-stone-900">
          {{ t('colour.palette.adjusting', { hex: rgbToHex(colours[open]!) }) }}
        </p>
        <input
          :value="rgbToHex(colours[open]!)"
          type="color"
          class="h-9 w-14 cursor-pointer rounded-lg border border-stone-300 bg-white"
          :aria-label="t('colour.picker.pick')"
          @input="replace(open!, ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="grid grid-cols-9 gap-1.5">
        <ShellSwatch v-for="(entry, i) in variants.lighter" :key="`l${i}`" :colour="entry" size="sm" />
        <ShellSwatch :colour="colours[open]!" size="sm" />
        <ShellSwatch v-for="(entry, i) in variants.darker" :key="`d${i}`" :colour="entry" size="sm" />
      </div>
      <p class="text-xs text-stone-500">
        {{ t('colour.palette.shadeHint') }}
      </p>
    </div>

    <div v-if="confusable.length" class="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <TriangleAlert :size="18" class="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
      <p class="text-sm text-amber-900">
        {{ t('colour.palette.confusable', { n: confusable.length }) }}
      </p>
    </div>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold text-stone-900">{{ t('colour.palette.takeItWith') }}</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="entry in exports"
          :key="entry.key"
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="copy(entry.value, entry.key)"
        >
          {{ copied === entry.key ? t('colour.copied') : t(`colour.palette.as.${entry.key}`) }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="copy(shareUrl, 'link')"
        >
          <Copy :size="15" aria-hidden="true" />
          {{ copied === 'link' ? t('colour.copied') : t('colour.palette.copyLink') }}
        </button>
      </div>
      <p class="text-xs text-stone-500">{{ t('colour.palette.linkHint') }}</p>
    </section>
  </div>
</template>
