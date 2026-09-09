<script setup lang="ts">
import { bmi, healthyWeightRange, tidyNumber } from '~/utils/calc'

const { t } = useI18n()

const kg = ref<number | null>(70)
const cm = ref<number | null>(175)

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
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="bmi-kg" class="block text-sm font-medium text-slate-900">
          {{ t('bmi.weight') }}
        </label>
        <input
          id="bmi-kg"
          v-model.number="kg"
          type="number"
          min="1"
          step="any"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div>
        <label for="bmi-cm" class="block text-sm font-medium text-slate-900">
          {{ t('bmi.height') }}
        </label>
        <input
          id="bmi-cm"
          v-model.number="cm"
          type="number"
          min="1"
          step="any"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>

    <template v-if="result">
      <div class="rounded-lg border p-4" :class="categoryClass">
        <p class="text-sm">{{ t('bmi.yourBmi') }}</p>
        <p class="mt-1 text-3xl font-semibold tabular-nums">{{ tidyNumber(result.value) }}</p>
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
            class="absolute -translate-x-1/2 text-xs font-medium text-slate-700"
            :style="{ left: `${markerPercent}%` }"
          >
            ▲
          </span>
        </div>
        <div class="flex justify-between text-xs text-slate-500">
          <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
        </div>
      </div>

      <p v-if="healthy" class="text-sm text-slate-600">
        {{ t('bmi.healthyRange', { min: tidyNumber(healthy.min), max: tidyNumber(healthy.max) }) }}
      </p>
      <p class="text-xs text-slate-500">{{ t('bmi.disclaimer') }}</p>
    </template>
    <p v-else class="text-sm text-slate-500">{{ t('bmi.enterValues') }}</p>
  </div>
</template>
