<script setup lang="ts">
const { t } = useI18n()

/**
 * Zone maths is done entirely with `Intl`, so the browser's own tz database
 * handles daylight saving. Hard-coded UTC offsets are the usual bug here -
 * they silently go wrong twice a year.
 */
/**
 * The handful worth putting at the top, for the people this site is for.
 * Everything else follows alphabetically.
 */
const COMMON = [
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

/**
 * Names people type that the database does not use.
 *
 * The tz database keeps old spellings as the canonical id for compatibility,
 * so a browser hands back Asia/Katmandu and nobody searching Kathmandu ever
 * finds it. The same goes for the handful of cities that were renamed. The
 * country names are there because "what time is it in Japan" is how the
 * question is actually asked, not "Asia/Tokyo".
 */
const ALIASES: Record<string, string> = {
  'Asia/Katmandu': 'Kathmandu Nepal',
  'Asia/Calcutta': 'Kolkata India',
  'Asia/Kolkata': 'Calcutta India Mumbai Delhi',
  'Asia/Saigon': 'Ho Chi Minh Vietnam',
  'Asia/Ho_Chi_Minh': 'Saigon Vietnam',
  'Asia/Rangoon': 'Yangon Myanmar Burma',
  'Asia/Yangon': 'Rangoon Myanmar Burma',
  'Asia/Thimbu': 'Thimphu Bhutan',
  'Asia/Macao': 'Macau',
  'Europe/Kiev': 'Kyiv Ukraine',
  'Europe/Kyiv': 'Kiev Ukraine',
  'Africa/Asmera': 'Asmara Eritrea',
  'America/Godthab': 'Nuuk Greenland',
  'Atlantic/Faeroe': 'Faroe Islands',
  'Pacific/Ponape': 'Pohnpei Micronesia',
  'Asia/Tashkent': 'Uzbekistan',
  'Europe/Moscow': 'Russia',
  'Europe/London': 'United Kingdom UK Britain England',
  'Europe/Berlin': 'Germany',
  'Europe/Istanbul': 'Turkey Turkiye',
  'Asia/Dubai': 'United Arab Emirates UAE Abu Dhabi',
  'Asia/Almaty': 'Kazakhstan',
  'Asia/Karachi': 'Pakistan',
  'Asia/Shanghai': 'China Beijing',
  'Asia/Tokyo': 'Japan',
  'Asia/Seoul': 'South Korea',
  'America/New_York': 'United States USA east coast EST',
  'America/Chicago': 'United States USA central CST',
  'America/Los_Angeles': 'United States USA west coast California PST',
  'America/Sao_Paulo': 'Brazil',
  'Australia/Sydney': 'Australia'
}

/**
 * Every zone the browser knows, which is the whole IANA database — a few
 * hundred of them, kept current by whoever ships the browser rather than by
 * us. A hand-written list is fine until someone needs Asia/Yerevan and finds
 * eighteen entries and no way in.
 *
 * Filled in after mounting so the server and the client render the same
 * markup; the list only matters once the picker is opened, which is well
 * after that.
 */
const ZONES = ref<string[]>(COMMON)

function allZones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.('timeZone')
    if (!supported?.length) return COMMON
    const rest = supported.filter(zone => !COMMON.includes(zone)).sort()
    return [...COMMON, ...rest]
  } catch {
    // Older browsers have the zones but will not enumerate them.
    return COMMON
  }
}

/** Whatever this device is set to, which is the only sensible default. */
function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const source = ref(localZone())
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
  // Rounded because the formatted parts stop at whole seconds while the
  // instant carries milliseconds, and every real zone offset is a whole
  // number of minutes anyway. Without this you get UTC+02:59.9957.
  return Math.round((asUtc - at.getTime()) / 60000)
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

const zoneLabel = (zone: string) => zone.replace(/_/g, ' ').replace(/\//g, ' / ')

/**
 * Built once rather than as a live computed: an offset needs a formatter per
 * zone, and doing that for four hundred of them on every keystroke in the
 * search box is a visibly janky picker. They only change at a daylight
 * saving boundary, which no open tab is going to sit through.
 */
const zoneOptions = shallowRef<{ value: string; label: string; hint: string }[]>([])

function buildOptions() {
  const at = new Date()
  zoneOptions.value = ZONES.value.map(zone => {
    const offset = offsetMinutes(zone, at)
    const sign = offset >= 0 ? '+' : '-'
    const abs = Math.abs(offset)
    return {
      value: zone,
      label: zoneLabel(zone),
      hint: `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`,
      search: ALIASES[zone]
    }
  })
}

/** The add-a-zone picker never holds a value; choosing one is the action. */
const addOptions = computed(() => [
  { value: '', label: t('timezone.choose'), hint: '', search: '' },
  ...zoneOptions.value.filter(option => !targets.value.includes(option.value) && option.value !== source.value)
])

onMounted(() => {
  ZONES.value = allZones()
  buildOptions()
})
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <div>
        <label for="tz-date" class="block text-sm font-medium text-stone-900">
          {{ t('timezone.date') }}
        </label>
        <input
          id="tz-date"
          v-model="date"
          type="date"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
      <div>
        <label for="tz-time" class="block text-sm font-medium text-stone-900">
          {{ t('timezone.time') }}
        </label>
        <input
          id="tz-time"
          v-model="time"
          type="time"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
      </div>
      <div>
        <label for="tz-source" class="block text-sm font-medium text-stone-900">
          {{ t('timezone.sourceZone') }}
        </label>
        <ShellSelect
          v-model="source"
          :options="zoneOptions"
          :aria-label="t('timezone.source')"
          class="mt-1 w-full"
        />
      </div>
    </div>

    <div v-if="sourceRow" class="rounded-lg border border-ember-200 bg-ember-50 p-3">
      <p class="text-xs text-ember-800">{{ zoneLabel(sourceRow.zone) }} · {{ sourceRow.offset }}</p>
      <p class="mt-0.5 text-lg font-semibold text-ember-900">{{ sourceRow.text }}</p>
    </div>

    <div>
      <label for="tz-add" class="block text-sm font-medium text-stone-900">
        {{ t('timezone.addZone') }}
      </label>
      <ShellSelect
        :model-value="''"
        :options="addOptions"
        :aria-label="t('timezone.choose')"
        class="mt-1 w-full sm:w-64"
        @update:model-value="value => value && addTarget(value)"
      />
    </div>

    <ul v-if="rows.length" class="divide-y divide-stone-200 rounded-lg border border-stone-200">
      <li v-for="row in rows" :key="row.zone" class="flex items-center gap-3 p-3">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-stone-900">
            {{ zoneLabel(row.zone) }}
          </span>
          <span class="block text-xs text-stone-500">{{ row.offset }}</span>
        </span>
        <span class="shrink-0 tabular-nums text-stone-900">{{ row.text }}</span>
        <button
          type="button"
          class="shrink-0 rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-red-50 hover:text-red-700"
          :aria-label="t('timezone.remove', { zone: zoneLabel(row.zone) })"
          @click="removeTarget(row.zone)"
        >
          ✕
        </button>
      </li>
    </ul>
  </div>
</template>
