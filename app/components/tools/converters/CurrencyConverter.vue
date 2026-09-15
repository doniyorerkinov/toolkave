<script setup lang="ts">
import { convertCurrency, useRates } from '~/composables/useRates'
import { tidyNumber } from '~/utils/calc'

const { t, locale } = useI18n()
const { table, pending, failed, load } = useRates()

const amount = ref<number | null>(100)
const from = ref('USD')
const to = ref('UZS')

// Rates are fetched in the browser, never at prerender time, so the static
// page never ships a stale number baked in at build.
onMounted(() => load())

const codes = computed(() => (table.value ? Object.keys(table.value.rates).sort() : []))

/**
 * "RON — Romanian leu" rather than "RON".
 *
 * Nobody knows a hundred currency codes, and the browser already has the
 * names in every language we ship, so there is no table to keep. Where it
 * has no name for a code the code stands on its own.
 */
const currencyNames = computed(() => {
  try {
    return new Intl.DisplayNames([locale.value], { type: 'currency' })
  } catch {
    return null
  }
})

const options = computed(() =>
  codes.value.map(code => {
    const name = currencyNames.value?.of(code)
    return { value: code, label: code, hint: name && name !== code ? name : undefined }
  })
)

const result = computed(() => {
  if (!table.value || amount.value === null) return null
  return convertCurrency(amount.value, from.value, to.value, table.value.rates)
})

const unitRate = computed(() => {
  if (!table.value) return null
  return convertCurrency(1, from.value, to.value, table.value.rates)
})

function swap() {
  const previous = from.value
  from.value = to.value
  to.value = previous
}

const sourceName = computed(() =>
  table.value?.source === 'cbu' ? t('currency.sourceCbu') : t('currency.sourceErApi')
)

/** The currencies people here actually compare against. */
const COMMON = ['USD', 'EUR', 'RUB', 'KZT', 'TRY', 'CNY']

/**
 * A few rates alongside the one that was asked for.
 *
 * These follow whatever is being converted *to*, rather than always being
 * against the som. Converting dollars to yen and then being shown six rates
 * against the som is a table about a question nobody asked; the same six
 * against the yen is the context that makes the answer mean something.
 *
 * The som leads whenever it is not the target, because it is still the
 * currency most people reading this think in.
 */
const popular = computed(() => {
  if (!table.value) return []
  const target = to.value
  const order = target === 'UZS' ? COMMON : ['UZS', ...COMMON]
  return order
    .filter(code => code !== target && table.value!.rates[code])
    .slice(0, 6)
    .map(code => ({ code, value: convertCurrency(1, code, target, table.value!.rates) }))
    .filter(row => row.value !== null)
})
</script>

<template>
  <div class="space-y-4">
    <p v-if="pending && !table" class="text-sm text-stone-500">{{ t('currency.loading') }}</p>

    <div
      v-else-if="failed"
      class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      role="alert"
    >
      {{ t('currency.failed') }}
      <button
        type="button"
        class="ms-2 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium"
        @click="load(true)"
      >
        {{ t('currency.retry') }}
      </button>
    </div>

    <template v-if="table">
      <div class="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <label for="cur-amount" class="block text-sm font-medium text-stone-900">
            {{ t('currency.amount') }}
          </label>
          <div class="mt-1 flex gap-2">
            <ShellNumberInput
              id="cur-amount"
              v-model="amount"
              :decimals="2"
              :min="0"
              class="min-w-0 flex-1"
            />
            <ShellSelect
              v-model="from"
              :options="options"
              :aria-label="t('currency.from')"
              class="w-28 shrink-0"
            />
          </div>
        </div>

        <button
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          :aria-label="t('currency.swap')"
          @click="swap"
        >
          ⇄
        </button>

        <div>
          <label for="cur-out" class="block text-sm font-medium text-stone-900">
            {{ t('currency.converted') }}
          </label>
          <div class="mt-1 flex gap-2">
            <output
              id="cur-out"
              class="min-w-0 flex-1 truncate rounded-lg border border-ember-200 bg-ember-50 px-3 py-2 font-semibold tabular-nums text-ember-900"
            >
              {{ result === null ? '—' : tidyNumber(result) }}
            </output>
            <ShellSelect
              v-model="to"
              :options="options"
              :aria-label="t('currency.to')"
              align="end"
              class="w-28 shrink-0"
            />
          </div>
        </div>
      </div>

      <p v-if="unitRate !== null" class="text-sm text-stone-600">
        1 {{ from }} = {{ tidyNumber(unitRate) }} {{ to }}
      </p>

      <div v-if="popular.length">
        <h3 class="mb-2 text-sm font-medium text-stone-900">{{ t('currency.popular', { code: to }) }}</h3>
        <dl class="grid gap-2 sm:grid-cols-3">
          <div
            v-for="row in popular"
            :key="row.code"
            class="rounded-lg border border-stone-200 bg-white px-3 py-2"
          >
            <dt class="text-xs text-stone-500">1 {{ row.code }}</dt>
            <dd class="mt-0.5 tabular-nums text-stone-900">{{ tidyNumber(row.value!) }} {{ to }}</dd>
          </div>
        </dl>
      </div>

      <p class="text-xs text-stone-500">
        {{ t('currency.attribution', { source: sourceName, date: table.date }) }}
      </p>
    </template>
  </div>
</template>
