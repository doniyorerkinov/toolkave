<script setup lang="ts">
import { FAT_BANDS, WAIST_LIMITS, bmi, bodyFatPercent, fatBand, healthyWeightRange, type Sex } from '~/utils/calc'

const { t } = useI18n()

const kg = ref<number | null>(70)
const cm = ref<number | null>(175)
const sex = ref<Sex>('male')
const age = ref<number | null>(30)

const result = computed(() => (kg.value && cm.value ? bmi(kg.value, cm.value) : null))
const healthy = computed(() => (cm.value ? healthyWeightRange(cm.value) : null))

const categoryClass = computed(() => {
  if (!result.value) return ''
  return {
    underweight: 'border-amber-200 bg-amber-50 text-amber-900',
    normal: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    overweight: 'border-amber-200 bg-amber-50 text-amber-900',
    obese: 'border-red-200 bg-red-50 text-red-900'
  }[result.value.category]
})

/** Position on a 15-40 scale, which is where the meaningful range sits. */
const markerPercent = computed(() => {
  if (!result.value) return 0
  return Math.min(100, Math.max(0, ((result.value.value - 15) / 25) * 100))
})

const bands = [
  { key: 'underweight', width: 14, class: 'bg-amber-300' },
  { key: 'normal', width: 26, class: 'bg-emerald-400' },
  { key: 'overweight', width: 20, class: 'bg-amber-400' },
  { key: 'obese', width: 40, class: 'bg-red-400' }
]

/**
 * The part that genuinely differs between men and women.
 *
 * BMI itself does not: the thresholds are the same for both adult sexes,
 * which surprises nearly everyone. What differs is how much fat sits behind
 * a given BMI, so that is what gets its own chart rather than two identical
 * ones with different labels.
 */
/** One decimal, because the equation is accurate to a few points at best. */
const fat = computed(() => {
  if (!result.value || !age.value) return null
  const percent = bodyFatPercent(result.value.value, age.value, sex.value)
  return percent === null ? null : { percent, band: fatBand(percent, sex.value) }
})

const FAT_TONE: Record<string, string> = {
  essential: 'bg-sky-300',
  athletic: 'bg-emerald-400',
  fit: 'bg-emerald-300',
  average: 'bg-amber-300',
  high: 'bg-red-300'
}

/** The chart is drawn to the last band's top, so both sexes share a scale. */
const fatScale = computed(() => {
  const list = FAT_BANDS[sex.value]
  const top = list[list.length - 1]!.to
  const start = list[0]!.from
  return { start, top, span: top - start }
})

const fatChart = computed(() =>
  FAT_BANDS[sex.value].map(band => ({
    key: band.key,
    from: band.from,
    to: band.to,
    left: ((band.from - fatScale.value.start) / fatScale.value.span) * 100,
    width: ((band.to - band.from) / fatScale.value.span) * 100,
    tone: FAT_TONE[band.key]!
  }))
)

const fatMarker = computed(() => {
  if (!fat.value) return 0
  const { start, span } = fatScale.value
  return Math.min(100, Math.max(0, ((fat.value.percent - start) / span) * 100))
})

const waist = computed(() => WAIST_LIMITS[sex.value])
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-4">
      <div>
        <label for="bmi-kg" class="block text-sm font-medium text-stone-900">
          {{ t('bmi.weight') }}
        </label>
        <input
          id="bmi-kg"
          v-model.number="kg"
          type="number"
          min="1"
          step="any"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
      <div>
        <label for="bmi-cm" class="block text-sm font-medium text-stone-900">
          {{ t('bmi.height') }}
        </label>
        <input
          id="bmi-cm"
          v-model.number="cm"
          type="number"
          min="1"
          step="any"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
      <div>
        <label for="bmi-age" class="block text-sm font-medium text-stone-900">{{ t('bmi.age') }}</label>
        <ShellNumberInput id="bmi-age" v-model="age" :min="2" :max="120" class="mt-1" />
      </div>
      <fieldset>
        <legend class="block text-sm font-medium text-stone-900">{{ t('bmi.sex') }}</legend>
        <div class="mt-1 flex gap-1.5">
          <label
            v-for="option in (['female', 'male'] as Sex[])"
            :key="option"
            class="flex-1 cursor-pointer rounded-lg border px-2 py-2 text-center text-sm font-medium"
            :class="
              sex === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="sex" type="radio" :value="option" class="sr-only" />
            {{ t(`bmi.${option}`) }}
          </label>
        </div>
      </fieldset>
    </div>

    <template v-if="result">
      <div class="rounded-lg border p-4" :class="categoryClass">
        <p class="text-sm">{{ t('bmi.yourBmi') }}</p>
        <p class="mt-1 text-3xl font-semibold tabular-nums">{{ result.value.toFixed(1) }}</p>
        <p class="mt-1 font-medium">{{ t(`bmi.categories.${result.category}`) }}</p>
      </div>

      <div>
        <div class="flex h-3 overflow-hidden rounded-full">
          <div
            v-for="band in bands"
            :key="band.key"
            :class="band.class"
            :style="{ width: `${band.width}%` }"
          />
        </div>
        <div class="relative mt-1 h-4">
          <span
            class="absolute -translate-x-1/2 text-xs font-medium text-stone-700"
            :style="{ left: `${markerPercent}%` }"
          >
            ▲
          </span>
        </div>
        <div class="flex justify-between text-xs text-stone-500">
          <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
        </div>
      </div>

      <p v-if="healthy" class="text-sm text-stone-600">
        {{ t('bmi.healthyRange', { min: healthy.min.toFixed(1), max: healthy.max.toFixed(1) }) }}
      </p>
      <p class="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
        {{ t('bmi.sameForBoth') }}
      </p>

      <section v-if="fat">
        <h3 class="text-sm font-semibold text-stone-900">
          {{ t('bmi.bodyFat', { sex: t(`bmi.${sex}`).toLowerCase() }) }}
        </h3>
        <p class="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">
          {{ fat.percent.toFixed(1) }}%
          <span class="ms-1 text-sm font-medium text-stone-500">{{ t(`bmi.fat.${fat.band}`) }}</span>
        </p>

        <div class="relative mt-3 h-5 overflow-hidden rounded-full bg-stone-100">
          <div
            v-for="band in fatChart"
            :key="band.key"
            class="absolute inset-y-0"
            :class="band.tone"
            :style="{ left: band.left + '%', width: band.width + '%' }"
            :title="`${t(`bmi.fat.${band.key}`)} · ${band.from}–${band.to}%`"
          />
          <div
            class="absolute inset-y-0 w-0.5 bg-stone-900"
            :style="{ left: fatMarker + '%' }"
            :aria-hidden="true"
          />
        </div>
        <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
          <li v-for="band in fatChart" :key="band.key" class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :class="band.tone" />
            {{ t(`bmi.fat.${band.key}`) }}
            <span class="text-stone-400 tabular-nums">{{ band.from }}–{{ band.to }}%</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-stone-500">{{ t('bmi.fatNote') }}</p>
      </section>

      <section class="rounded-lg border border-stone-200 p-3">
        <h3 class="text-sm font-semibold text-stone-900">{{ t('bmi.waist') }}</h3>
        <p class="mt-1 text-sm text-stone-600">
          {{ t('bmi.waistGuide', { raised: waist.raised, high: waist.high }) }}
        </p>
      </section>

      <p class="text-xs text-stone-500">{{ t('bmi.disclaimer') }}</p>
    </template>
    <p v-else class="text-sm text-stone-500">{{ t('bmi.enterValues') }}</p>
  </div>
</template>
