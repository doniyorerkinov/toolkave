<script setup lang="ts">
import { dateDifference } from '~/utils/calc'

const { t } = useI18n()

/**
 * Dates are local calendar days throughout. `new Date('2026-01-15')` is UTC
 * midnight and `toISOString()` prints UTC, so mixing either with the local
 * getters shifts a day for anyone east or west of Greenwich — which is
 * everyone this site is for.
 */
function parseLocal(value: string): Date | null {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const from = ref('1990-01-15')
const to = ref(formatLocal(new Date()))

const result = computed(() => {
  const start = parseLocal(from.value)
  const end = parseLocal(to.value)
  if (!start || !end) return null
  return dateDifference(start, end)
})

const nextBirthday = computed(() => {
  const birth = parseLocal(from.value)
  if (!birth) return null

  const reference = parseLocal(to.value) ?? parseLocal(formatLocal(new Date()))!
  let next = new Date(reference.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < reference) next = new Date(reference.getFullYear() + 1, birth.getMonth(), birth.getDate())

  const days = Math.round((next.getTime() - reference.getTime()) / 86_400_000)
  return { days, date: formatLocal(next) }
})

const stats = computed(() => {
  if (!result.value) return []
  return [
    { key: 'months', label: t('age.totalMonths'), value: result.value.totalMonths },
    { key: 'weeks', label: t('age.totalWeeks'), value: result.value.totalWeeks },
    { key: 'days', label: t('age.totalDays'), value: result.value.totalDays }
  ]
})
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="age-from" class="block text-sm font-medium text-slate-900">
          {{ t('age.fromLabel') }}
        </label>
        <input
          id="age-from"
          v-model="from"
          type="date"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div>
        <label for="age-to" class="block text-sm font-medium text-slate-900">
          {{ t('age.toLabel') }}
        </label>
        <input
          id="age-to"
          v-model="to"
          type="date"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>

    <template v-if="result">
      <div class="rounded-lg border border-sky-200 bg-sky-50 p-4">
        <p class="text-sm text-sky-800">{{ t('age.exact') }}</p>
        <p class="mt-1 text-2xl font-semibold text-sky-900">
          {{ t('age.value', { y: result.years, m: result.months, d: result.days }) }}
        </p>
      </div>

      <dl class="grid gap-2 sm:grid-cols-3">
        <div
          v-for="stat in stats"
          :key="stat.key"
          class="rounded-lg border border-slate-200 bg-white p-3"
        >
          <dt class="text-xs tracking-wide text-slate-500 uppercase">{{ stat.label }}</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-slate-900">{{ stat.value }}</dd>
        </div>
      </dl>

      <p v-if="nextBirthday" class="text-sm text-slate-600">
        {{ t('age.nextBirthday', { days: nextBirthday.days, date: nextBirthday.date }) }}
      </p>
    </template>
    <p v-else class="text-sm text-slate-500">{{ t('age.enterDates') }}</p>
  </div>
</template>
