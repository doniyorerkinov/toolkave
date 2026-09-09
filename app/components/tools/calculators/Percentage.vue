<script setup lang="ts">
import { applyDiscount, percentChange, percentOf, tidyNumber, vat, whatPercent } from '~/utils/calc'

const { t } = useI18n()

type Mode = 'of' | 'what' | 'change' | 'discount' | 'vat'
const mode = ref<Mode>('of')

const a = ref<number | null>(15)
const b = ref<number | null>(200)
const vatRate = ref(12)
const vatInclusive = ref(false)

const modes: Mode[] = ['of', 'what', 'change', 'discount', 'vat']

const result = computed(() => {
  const x = a.value
  const y = b.value
  if (x === null || y === null) return null

  switch (mode.value) {
    case 'of':
      return [{ label: t('percent.resultOf', { p: x, v: tidyNumber(y) }), value: tidyNumber(percentOf(x, y)) }]
    case 'what': {
      const value = whatPercent(x, y)
      return value === null ? null : [{ label: t('percent.resultWhat'), value: `${tidyNumber(value)}%` }]
    }
    case 'change': {
      const value = percentChange(x, y)
      return value === null
        ? null
        : [
            {
              label: value >= 0 ? t('percent.increase') : t('percent.decrease'),
              value: `${value >= 0 ? '+' : ''}${tidyNumber(value)}%`
            }
          ]
    }
    case 'discount': {
      const { saved, final } = applyDiscount(x, y)
      return [
        { label: t('percent.youSave'), value: tidyNumber(saved) },
        { label: t('percent.finalPrice'), value: tidyNumber(final) }
      ]
    }
    case 'vat': {
      const r = vat(x, vatRate.value, vatInclusive.value)
      return [
        { label: t('percent.net'), value: tidyNumber(r.net) },
        { label: t('percent.tax'), value: tidyNumber(r.tax) },
        { label: t('percent.gross'), value: tidyNumber(r.gross) }
      ]
    }
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-2">
      <label
        v-for="option in modes"
        :key="option"
        class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
        :class="
          mode === option
            ? 'border-sky-500 bg-sky-50 text-sky-900'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        "
      >
        <input v-model="mode" type="radio" :value="option" class="sr-only" />
        {{ t(`percent.modes.${option}`) }}
      </label>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="pc-a" class="block text-sm font-medium text-slate-900">
          {{ t(`percent.labels.${mode}.a`) }}
        </label>
        <input
          id="pc-a"
          v-model.number="a"
          type="number"
          step="any"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div v-if="mode !== 'vat'">
        <label for="pc-b" class="block text-sm font-medium text-slate-900">
          {{ t(`percent.labels.${mode}.b`) }}
        </label>
        <input
          id="pc-b"
          v-model.number="b"
          type="number"
          step="any"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div v-else>
        <label for="pc-vat" class="block text-sm font-medium text-slate-900">
          {{ t('percent.vatRate') }}
        </label>
        <input
          id="pc-vat"
          v-model.number="vatRate"
          type="number"
          step="any"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>

    <label v-if="mode === 'vat'" class="flex items-center gap-2 text-sm text-slate-700">
      <input v-model="vatInclusive" type="checkbox" class="size-4 accent-sky-700" />
      {{ t('percent.vatInclusive') }}
    </label>

    <dl v-if="result" class="grid gap-2 sm:grid-cols-3">
      <div
        v-for="item in result"
        :key="item.label"
        class="rounded-lg border border-sky-200 bg-sky-50 p-3"
      >
        <dt class="text-xs text-sky-800">{{ item.label }}</dt>
        <dd class="mt-1 text-2xl font-semibold tabular-nums text-sky-900">{{ item.value }}</dd>
      </div>
    </dl>
    <p v-else class="text-sm text-slate-500">{{ t('percent.enterValues') }}</p>
  </div>
</template>
