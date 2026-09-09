<script setup lang="ts">
const { t } = useI18n()

/**
 * Zone maths is done entirely with `Intl`, so the browser's own tz database
 * handles daylight saving. Hard-coded UTC offsets are the usual bug here -
 * they silently go wrong twice a year.
 */
const ZONES = [
  'Asia/Tashkent',
  'Europe/Moscow',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Almaty',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'UTC'
]

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const source = ref(ZONES.includes(localZone()) ? localZone() : 'Asia/Tashkent')
const targets = ref<string[]>(['Europe/London', 'America/New_York', 'Asia/Dubai'])

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const date = ref(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
const time = ref(`${pad(now.getHours())}:${pad(now.getMinutes())}`)

/** Offset of a zone from UTC at a given instant, in minutes. */
function offsetMinutes(zone: string, at: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(at).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  ) as Record<string, string>

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )
  return (asUtc - at.getTime()) / 60000
}

/** The instant that the chosen wall-clock time represents in the source zone. */
const instant = computed(() => {
  if (!date.value || !time.value) return null
  const [y, m, d] = date.value.split('-').map(Number)
  const [hh, mm] = time.value.split(':').map(Number)
  if (!y || !m || !d) return null

  const guess = Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0)
  // Two passes: the offset can differ either side of a DST boundary.
  let result = guess - offsetMinutes(source.value, new Date(guess)) * 60000
  result = guess - offsetMinutes(source.value, new Date(result)) * 60000
  return new Date(result)
})

function format(zone: string, at: Date) {
  const dt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(at)

  const offset = offsetMinutes(zone, at)
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return { text: dt, offset: `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}` }
}

const rows = computed(() => {
  const at = instant.value
  if (!at) return []
  return targets.value.map(zone => ({ zone, ...format(zone, at) }))
})

const sourceRow = computed(() => {
  const at = instant.value
  return at ? { zone: source.value, ...format(source.value, at) } : null
})

function addTarget(zone: string) {
  if (zone && !targets.value.includes(zone)) targets.value = [...targets.value, zone]
}
function removeTarget(zone: string) {
  targets.value = targets.value.filter(z => z !== zone)
}

const zoneLabel = (zone: string) => zone.replace(/_/g, ' ').replace('/', ' / ')
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <div>
        <label for="tz-date" class="block text-sm font-medium text-slate-900">
          {{ t('timezone.date') }}
        </label>
        <input
          id="tz-date"
          v-model="date"
          type="date"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div>
        <label for="tz-time" class="block text-sm font-medium text-slate-900">
          {{ t('timezone.time') }}
        </label>
        <input
          id="tz-time"
          v-model="time"
          type="time"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div>
        <label for="tz-source" class="block text-sm font-medium text-slate-900">
          {{ t('timezone.sourceZone') }}
        </label>
        <select
          id="tz-source"
          v-model="source"
          class="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-sky-500"
        >
          <option v-for="zone in ZONES" :key="zone" :value="zone">{{ zoneLabel(zone) }}</option>
        </select>
      </div>
    </div>

    <div v-if="sourceRow" class="rounded-lg border border-sky-200 bg-sky-50 p-3">
      <p class="text-xs text-sky-800">{{ zoneLabel(sourceRow.zone) }} · {{ sourceRow.offset }}</p>
      <p class="mt-0.5 text-lg font-semibold text-sky-900">{{ sourceRow.text }}</p>
    </div>

    <div>
      <label for="tz-add" class="block text-sm font-medium text-slate-900">
        {{ t('timezone.addZone') }}
      </label>
      <select
        id="tz-add"
        class="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 outline-none focus:border-sky-500 sm:w-auto"
        @change="addTarget(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
      >
        <option value="">{{ t('timezone.choose') }}</option>
        <option v-for="zone in ZONES" :key="zone" :value="zone">{{ zoneLabel(zone) }}</option>
      </select>
    </div>

    <ul v-if="rows.length" class="divide-y divide-slate-200 rounded-lg border border-slate-200">
      <li v-for="row in rows" :key="row.zone" class="flex items-center gap-3 p-3">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-slate-900">
            {{ zoneLabel(row.zone) }}
          </span>
          <span class="block text-xs text-slate-500">{{ row.offset }}</span>
        </span>
        <span class="shrink-0 tabular-nums text-slate-900">{{ row.text }}</span>
        <button
          type="button"
          class="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700"
          :aria-label="t('timezone.remove', { zone: zoneLabel(row.zone) })"
          @click="removeTarget(row.zone)"
        >
          ✕
        </button>
      </li>
    </ul>
  </div>
</template>
