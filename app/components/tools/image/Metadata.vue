<script setup lang="ts">
import { MapPin, ShieldCheck } from 'lucide-vue-next'
import { readMetadata, stripMetadata, type Metadata } from '~~/shared/image-metadata'
import { EXTENSION, sniffImage } from '~/composables/useImage'
import { toolPath, tools, type Locale } from '~/data/tools'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Show a picture's hidden notes, then take them out.
 *
 * The listing comes first and the button second on purpose: nobody asks to
 * remove metadata until they have seen their own camera's serial number and
 * the street they were standing on.
 */
const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value as Locale)
const store = useFilesStore()

const found = ref<Metadata | null>(null)
const isHeic = ref(false)

const file = computed(() => store.files[0] ?? null)
/** The cleaned file is the same format as the original — nothing is re-encoded. */
const extension = computed(() => {
  const kind = file.value ? sniffImage(file.value.data) : null
  return kind && kind !== 'heic' && kind !== 'gif' ? EXTENSION[kind] : 'jpg'
})
const hasAnything = computed(() => !!found.value && found.value.bytes > 0)

/** Each present field as a label and a value, in the order that matters. */
const rows = computed(() => {
  const meta = found.value
  if (!meta) return []
  const out: { key: string; label: string; value: string; alarming?: boolean }[] = []
  const add = (key: string, value: string | undefined, alarming = false) => {
    if (value) out.push({ key, label: t(`image.metadata.field.${key}`), value, alarming })
  }

  if (meta.gps) {
    const { latitude, longitude, altitude } = meta.gps
    const degrees = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    add('gps', altitude === undefined ? degrees : t('image.metadata.withAltitude', { degrees, m: altitude }), true)
  }
  add('camera', [meta.make, meta.model].filter(Boolean).join(' ') || undefined)
  add('lens', meta.lens)
  add('serial', meta.serial, true)
  add('lensSerial', meta.lensSerial, true)
  add('taken', meta.taken ? meta.taken.replace(/^(\d{4}):(\d{2}):/, '$1-$2-') : undefined)
  add('software', meta.software)
  add('artist', meta.artist)
  add('copyright', meta.copyright)
  return out
})

watch(
  file,
  current => {
    found.value = null
    isHeic.value = false
    if (!current) return
    try {
      isHeic.value = sniffImage(current.data) === 'heic'
      found.value = readMetadata(current.data)
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

/** Where to send someone whose file we cannot strip without re-encoding. */
const heicTool = computed(() => {
  const tool = tools.find(candidate => candidate.id === 'heic-to-jpg')
  return tool ? toolPath(tool, currentLocale.value) : undefined
})

function run() {
  if (!file.value || !hasAnything.value) return
  store.busy = true
  store.error = null
  try {
    const { data, removed } = stripMetadata(file.value.data)
    store.setResult({
      name: withSuffix(file.value.name, '-clean', extension.value),
      type: file.value.type || 'image/jpeg',
      data,
      sourceSize: file.value.size,
      note: t('image.metadata.note', { size: formatBytes(removed) })
    })
  } catch {
    store.error = t('image.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <template v-if="file && found">
      <div v-if="isHeic || !found.supported" class="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p class="text-sm text-amber-900">{{ t('image.metadata.unsupported') }}</p>
        <NuxtLink
          v-if="isHeic && heicTool"
          :to="heicTool"
          class="mt-2 inline-block text-sm font-medium text-ember-800 underline underline-offset-2"
        >
          {{ t('image.metadata.heicLink') }}
        </NuxtLink>
      </div>

      <div v-else-if="!hasAnything" class="flex gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <ShieldCheck :size="20" class="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
        <div>
          <p class="font-medium text-stone-900">{{ t('image.metadata.cleanTitle') }}</p>
          <p class="mt-1 text-sm text-stone-600">{{ t('image.metadata.cleanBody') }}</p>
        </div>
      </div>

      <div v-else class="space-y-3">
        <p class="text-sm text-stone-600">
          {{ t('image.metadata.summary', { size: formatBytes(found.bytes) }) }}
        </p>

        <dl class="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200">
          <div
            v-for="row in rows"
            :key="row.key"
            class="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
            :class="row.alarming ? 'bg-red-50' : 'bg-white'"
          >
            <dt class="w-40 shrink-0 text-sm text-stone-500">{{ row.label }}</dt>
            <dd
              class="min-w-0 flex-1 font-medium break-words"
              :class="row.alarming ? 'text-red-800' : 'text-stone-900'"
            >
              <MapPin v-if="row.key === 'gps'" :size="16" class="-mt-0.5 mr-1 inline" aria-hidden="true" />
              {{ row.value }}
            </dd>
          </div>
        </dl>

        <p v-if="found.gps" class="text-sm text-red-800">{{ t('image.metadata.gpsWarning') }}</p>
        <p v-else class="text-sm text-stone-500">{{ t('image.metadata.othersWarning') }}</p>
      </div>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        v-if="hasAnything && found?.supported && !isHeic"
        type="button"
        :disabled="store.busy"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.metadata.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="store.reset()"
      >
        {{ store.result ? t('result.startOver') : t('image.metadata.another') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
