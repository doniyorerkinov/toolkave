<script setup lang="ts">
import { Check, Eye, Shuffle, Wand2 } from 'lucide-vue-next'
import { PALETTES, PALETTE_TAGS, type Palette } from '~/data/palettes'
import { confusablePairs, hexToRgb, luminance, readableOn, rgbToHex } from '~~/shared/colour'
import { toolPath, tools, type Locale } from '~/data/tools'

/**
 * Palettes to browse rather than to generate.
 *
 * The generator answers "give me something"; this answers "show me
 * something", which is a different mood and the whole reason Color Hunt
 * exists. What is added is the check nobody in this category runs: whether
 * a palette survives red-green colour blindness, worked out from the
 * colours rather than claimed in a tag.
 */
const { t, locale } = useI18n()
const { copied, copy } = useCopy()

interface Entry {
  palette: Palette
  rgb: ReturnType<typeof hexToRgb>[]
  dark: boolean
  safe: boolean
  hash: string
}

const prepared = computed<Entry[]>(() =>
  PALETTES.map(palette => {
    const rgb = palette.colours.map(hex => hexToRgb(hex))
    const average = rgb.reduce((sum, entry) => sum + luminance(entry), 0) / rgb.length
    return {
      palette,
      rgb,
      dark: average < 0.35,
      safe: confusablePairs(rgb).length === 0,
      hash: palette.colours.map(hex => hex.slice(1)).join('-')
    }
  })
)

const tag = ref<string>('all')
const onlySafe = ref(false)
const shuffled = ref(false)
/** A fixed shuffle so the order does not change while someone is reading. */
const order = ref<number[]>([])

const filtered = computed(() => {
  const list = prepared.value.filter(entry => {
    if (tag.value !== 'all' && !entry.palette.tags.includes(tag.value)) return false
    if (onlySafe.value && !entry.safe) return false
    return true
  })
  if (!shuffled.value || !order.value.length) return list
  const rank = new Map(order.value.map((value, index) => [value, index]))
  return [...list].sort(
    (a, b) => (rank.get(prepared.value.indexOf(a)) ?? 0) - (rank.get(prepared.value.indexOf(b)) ?? 0)
  )
})

function shuffle() {
  const indices = prepared.value.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
  }
  order.value = indices
  shuffled.value = true
}

const generatorPath = computed(() => {
  const tool = tools.find(entry => entry.id === 'palette-generator')
  return tool ? (toolPath(tool, locale.value as Locale) ?? '') : ''
})

const ink = (hex: string) => rgbToHex(readableOn(hexToRgb(hex)))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="rounded-lg border px-3 py-1.5 text-sm font-medium"
        :class="
          tag === 'all'
            ? 'border-ember-500 bg-ember-50 text-ember-900'
            : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
        "
        @click="tag = 'all'"
      >
        {{ t('colour.gallery.all') }}
      </button>
      <button
        v-for="option in PALETTE_TAGS"
        :key="option"
        type="button"
        class="rounded-lg border px-3 py-1.5 text-sm font-medium"
        :class="
          tag === option
            ? 'border-ember-500 bg-ember-50 text-ember-900'
            : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
        "
        @click="tag = option"
      >
        {{ t(`colour.gallery.tag.${option}`) }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <label class="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
        <input v-model="onlySafe" type="checkbox" class="size-4 accent-ember-700" />
        {{ t('colour.gallery.onlySafe') }}
      </label>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="shuffle"
      >
        <Shuffle :size="15" aria-hidden="true" />
        {{ t('colour.gallery.shuffle') }}
      </button>
      <span class="ms-auto text-sm text-stone-500 tabular-nums">
        {{ t('colour.gallery.showing', { n: filtered.length }) }}
      </span>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="entry in filtered"
        :key="entry.hash"
        class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
      >
        <div class="grid h-36 grid-cols-4">
          <button
            v-for="hex in entry.palette.colours"
            :key="hex"
            type="button"
            class="group relative transition hover:brightness-105"
            :style="{ backgroundColor: hex }"
            :title="t('colour.copy') + ' ' + hex"
            @click="copy(hex)"
          >
            <span
              class="absolute inset-x-0 bottom-1 text-center font-mono text-[10px] font-semibold uppercase opacity-0 transition group-hover:opacity-100"
              :style="{ color: ink(hex) }"
            >
              <Check v-if="copied === hex" :size="11" class="inline" aria-hidden="true" />
              {{ copied === hex ? '' : hex.slice(1) }}
            </span>
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 p-2.5">
          <span
            v-for="name in entry.palette.tags"
            :key="name"
            class="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600"
          >
            {{ t(`colour.gallery.tag.${name}`) }}
          </span>
          <span
            v-if="entry.safe"
            class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
            :title="t('colour.gallery.safeTitle')"
          >
            <Eye :size="11" aria-hidden="true" />
            {{ t('colour.gallery.safe') }}
          </span>

          <span class="ms-auto flex items-center gap-1">
            <button
              type="button"
              class="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              @click="copy(entry.palette.colours.join(', '), entry.hash)"
            >
              {{ copied === entry.hash ? t('colour.copied') : t('colour.gallery.copyAll') }}
            </button>
            <NuxtLink
              v-if="generatorPath"
              :to="`${generatorPath}#${entry.hash}`"
              class="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              :title="t('colour.gallery.openInGenerator')"
            >
              <Wand2 :size="12" aria-hidden="true" />
            </NuxtLink>
          </span>
        </div>
      </article>
    </div>

    <p v-if="!filtered.length" class="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600">
      {{ t('colour.gallery.none') }}
    </p>
  </div>
</template>
