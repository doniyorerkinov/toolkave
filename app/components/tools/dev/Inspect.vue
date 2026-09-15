<script setup lang="ts">
/**
 * Paste something opaque and read back what it says: a JWT, an epoch, a cron
 * line. All three are strings a developer is handed and has to interpret, and
 * all three have a failure mode where the wrong reading looks plausible.
 */
import { decodeJwt, readCron, readEpoch } from '~~/shared/devtools'

const props = defineProps<{ mode: 'jwt' | 'epoch' | 'cron' }>()
const { t, locale } = useI18n()

const input = ref('')
const jwt = computed(() => (props.mode === 'jwt' && input.value.trim() ? decodeJwt(input.value) : null))
const epoch = computed(() => (props.mode === 'epoch' && input.value.trim() ? readEpoch(input.value) : null))
const cron = computed(() => (props.mode === 'cron' && input.value.trim() ? readCron(input.value) : null))

const invalid = computed(() => Boolean(input.value.trim()) && ((props.mode === 'jwt' && !jwt.value) || (props.mode === 'epoch' && !epoch.value)))

const zones = ['UTC', Intl.DateTimeFormat().resolvedOptions().timeZone]
const format = (date: Date, zone: string) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeStyle: 'long', timeZone: zone }).format(date)

const pretty = (value: unknown) => JSON.stringify(value, null, 2)
</script>

<template>
  <div class="space-y-4">
    <div>
      <label for="ins-in" class="block text-sm font-medium text-stone-900">{{ t('devtools.input') }}</label>
      <textarea id="ins-in" v-model="input" :rows="mode === 'jwt' ? 5 : 2" spellcheck="false"
        class="scroll-thin mt-2 w-full rounded-lg border border-stone-300 bg-white p-3 font-mono text-sm break-all"
        :placeholder="t(`devtools.placeholder.${mode}`)" />
    </div>

    <p v-if="invalid" class="text-sm font-medium text-red-700">{{ t(`devtools.invalid.${mode}`) }}</p>

    <!-- A decoded token, with the warning that decoding is not checking. -->
    <div v-if="jwt" class="space-y-4">
      <div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {{ t('devtools.jwtWarning') }}
      </div>
      <div v-if="jwt.expiresAt" class="rounded-lg border p-3 text-sm font-medium"
        :class="jwt.expired ? 'border-red-400 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'">
        {{ jwt.expired ? t('devtools.jwtExpired', { when: format(jwt.expiresAt, zones[1]!) }) : t('devtools.jwtValid', { when: format(jwt.expiresAt, zones[1]!) }) }}
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="part in [['header', jwt.header], ['payload', jwt.payload]]" :key="part[0] as string">
          <p class="text-sm font-medium text-stone-900">{{ t(`devtools.${part[0]}`) }}</p>
          <pre class="scroll-thin mt-2 overflow-x-auto rounded-lg border border-stone-300 bg-stone-50 p-3 font-mono text-xs text-stone-900">{{ pretty(part[1]) }}</pre>
        </div>
      </div>
    </div>

    <!-- A timestamp, in both the zone that matters and the one that is unambiguous. -->
    <div v-if="epoch" class="space-y-2 rounded-lg border border-stone-300 bg-white p-4">
      <p class="text-sm text-stone-500">{{ t('devtools.readAs', { unit: t(`devtools.${epoch.unit}`) }) }}</p>
      <dl class="grid gap-2">
        <div v-for="zone in zones" :key="zone" class="flex flex-wrap items-baseline justify-between gap-2">
          <dt class="text-sm font-medium text-stone-700">{{ zone }}</dt>
          <dd class="text-sm text-stone-900">{{ format(epoch.date, zone) }}</dd>
        </div>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <dt class="text-sm font-medium text-stone-700">ISO 8601</dt>
          <dd class="font-mono text-sm text-stone-900">{{ epoch.date.toISOString() }}</dd>
        </div>
      </dl>
    </div>

    <!-- A cron line in words, which is the only way to catch a wrong one. -->
    <div v-if="cron" class="space-y-3">
      <p class="rounded-lg border p-3 text-sm font-medium"
        :class="cron.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-400 bg-red-50 text-red-700'">
        {{ cron.description }}
      </p>
      <dl v-if="cron.ok" class="grid gap-2 rounded-lg border border-stone-300 bg-white p-4 sm:grid-cols-5">
        <div v-for="field in cron.fields" :key="field.name" class="text-center">
          <dt class="text-xs text-stone-500">{{ t(`devtools.cron.${field.name.replace(/ /g, '_')}`) }}</dt>
          <dd class="mt-1 font-mono text-sm font-semibold text-stone-900">{{ field.value }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
