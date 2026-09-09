<script setup lang="ts">
import { UNITS, convertUnit, tidyNumber, type UnitCategory } from '~/utils/calc'

const { t } = useI18n()

const categories = Object.keys(UNITS) as UnitCategory[]
const category = ref<UnitCategory>('length')

const unitsFor = computed(() => Object.keys(UNITS[category.value]))

const from = ref('m')
const to = ref('ft')
const value = ref<number | null>(1)

// Keep the selected units valid when the category changes.
watch(category, next => {
  const units = Object.keys(UNITS[next])
  from.value = units[0]!
  to.value = units[1] ?? units[0]!
})

const result = computed(() => {
  if (value.value === null) return null
  return convertUnit(value.value, category.value, from.value, to.value)
})

function swap() {
  const previous = from.value
  from.value = to.value
  to.value = previous
}

/** A few common conversions in the current category, for quick reference. */
const quickRows = computed(() => {
  if (value.value === null) return []
  return unitsFor.value
    .filter(unit => unit !== from.value)
    .map(unit => ({
      unit,
      value: convertUnit(value.value!, category.value, from.value, unit)
    }))
    .filter(row => row.value !== null)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-2">
      <label
        v-for="option in categories"
        :key="option"
        class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
        :class="
          category === option
            ? 'border-sky-500 bg-sky-50 text-sky-900'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        "
      >
        <input v-model="category" type="radio" :value="option" class="sr-only" />
        {{ t(`units.categories.${option}`) }}
      </label>
    </div>

    <div class="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div>
        <label for="uc-value" class="block text-sm font-medium text-slate-900">
          {{ t('units.from') }}
        </label>
        <div class="mt-1 flex gap-2">
          <input
            id="uc-value"
            v-model.number="value"
            type="number"
            step="any"
            class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
          <select
            v-model="from"
            :aria-label="t('units.from')"
            class="rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-sky-500"
          >
            <option v-for="unit in unitsFor" :key="unit" :value="unit">
              {{ t(`units.names.${unit}`) }}
            </option>
          </select>
        </div>
      </div>

      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        :aria-label="t('units.swap')"
        @click="swap"
      >
        ⇄
      </button>

      <div>
        <label for="uc-out" class="block text-sm font-medium text-slate-900">
          {{ t('units.to') }}
        </label>
        <div class="mt-1 flex gap-2">
          <output
            id="uc-out"
            class="min-w-0 flex-1 truncate rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 font-semibold tabular-nums text-sky-900"
          >
            {{ result === null ? '—' : tidyNumber(result) }}
          </output>
          <select
            v-model="to"
            :aria-label="t('units.to')"
            class="rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-sky-500"
          >
            <option v-for="unit in unitsFor" :key="unit" :value="unit">
              {{ t(`units.names.${unit}`) }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="quickRows.length">
      <h3 class="mb-2 text-sm font-medium text-slate-900">{{ t('units.allUnits') }}</h3>
      <dl class="grid gap-2 sm:grid-cols-3">
        <div
          v-for="row in quickRows"
          :key="row.unit"
          class="rounded-lg border border-slate-200 bg-white px-3 py-2"
        >
          <dt class="text-xs text-slate-500">{{ t(`units.names.${row.unit}`) }}</dt>
          <dd class="mt-0.5 tabular-nums text-slate-900">{{ tidyNumber(row.value!) }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
