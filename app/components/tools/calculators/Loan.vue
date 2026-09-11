<script setup lang="ts">
import { loan, tidyNumber } from '~/utils/calc'

const { t } = useI18n()

const principal = ref<number | null>(100000)
const rate = ref<number | null>(18)
const years = ref<number | null>(5)

const months = computed(() => (years.value ? Math.round(years.value * 12) : 0))

const result = computed(() => {
  if (principal.value === null || rate.value === null || !months.value) return null
  return loan(principal.value, rate.value, months.value)
})

/** Share of every payment that is interest rather than principal. */
const interestShare = computed(() => {
  if (!result.value || !result.value.totalPaid) return 0
  return Math.round((result.value.totalInterest / result.value.totalPaid) * 100)
})
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <div>
        <label for="ln-p" class="block text-sm font-medium text-stone-900">
          {{ t('loan.amount') }}
        </label>
        <input
          id="ln-p"
          v-model.number="principal"
          type="number"
          min="0"
          step="any"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
      <div>
        <label for="ln-r" class="block text-sm font-medium text-stone-900">
          {{ t('loan.rate') }}
        </label>
        <input
          id="ln-r"
          v-model.number="rate"
          type="number"
          min="0"
          step="any"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
      <div>
        <label for="ln-y" class="block text-sm font-medium text-stone-900">
          {{ t('loan.years') }}
        </label>
        <input
          id="ln-y"
          v-model.number="years"
          type="number"
          min="0"
          step="any"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
    </div>

    <template v-if="result">
      <div class="rounded-lg border border-ember-200 bg-ember-50 p-4">
        <p class="text-sm text-ember-800">{{ t('loan.monthly') }}</p>
        <p class="mt-1 text-3xl font-semibold tabular-nums text-ember-900">
          {{ tidyNumber(result.monthly) }}
        </p>
        <p class="mt-1 text-sm text-ember-800">{{ t('loan.overMonths', { n: months }) }}</p>
      </div>

      <dl class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-lg border border-stone-200 bg-white p-3">
          <dt class="text-xs tracking-wide text-stone-500 uppercase">{{ t('loan.totalPaid') }}</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-stone-900">
            {{ tidyNumber(result.totalPaid) }}
          </dd>
        </div>
        <div class="rounded-lg border border-stone-200 bg-white p-3">
          <dt class="text-xs tracking-wide text-stone-500 uppercase">
            {{ t('loan.totalInterest') }}
          </dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-stone-900">
            {{ tidyNumber(result.totalInterest) }}
          </dd>
        </div>
      </dl>

      <div>
        <div class="flex h-3 overflow-hidden rounded-full bg-emerald-400">
          <div class="bg-amber-400" :style="{ width: `${interestShare}%` }" />
        </div>
        <p class="mt-1 text-sm text-stone-600">
          {{ t('loan.interestShare', { n: interestShare }) }}
        </p>
      </div>
    </template>
    <p v-else class="text-sm text-stone-500">{{ t('loan.enterValues') }}</p>
  </div>
</template>
