<script setup lang="ts">
import type { PdfMetadata } from '~/composables/usePdf'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const meta = ref<PdfMetadata | null>(null)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    meta.value = null
    infoError.value = false
    if (!current) return
    try {
      meta.value = await readPdfMetadata(current)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

/** Collapse a run of identical page sizes into "A4 × 12". */
const sizeSummary = computed(() => {
  if (!meta.value) return []
  const counts = new Map<string, number>()
  for (const size of meta.value.pageSizes) {
    const key = `${size.label} · ${size.width} × ${size.height} pt`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }))
})

const rows = computed(() => {
  if (!meta.value || !file.value) return []
  return [
    { key: 'pages', label: t('pdf.info.pages'), value: String(meta.value.pageCount) },
    { key: 'size', label: t('pdf.info.fileSize'), value: formatBytes(file.value.size) },
    { key: 'title', label: t('pdf.info.title'), value: meta.value.title },
    { key: 'author', label: t('pdf.info.author'), value: meta.value.author },
    { key: 'subject', label: t('pdf.info.subject'), value: meta.value.subject },
    { key: 'creator', label: t('pdf.info.creator'), value: meta.value.creator },
    { key: 'producer', label: t('pdf.info.producer'), value: meta.value.producer },
    { key: 'created', label: t('pdf.info.created'), value: meta.value.created },
    { key: 'modified', label: t('pdf.info.modified'), value: meta.value.modified }
  ]
})

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="application/pdf"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <template v-else-if="meta">
      <p
        v-if="meta.encrypted"
        class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        {{ t('pdf.info.encrypted') }}
      </p>

      <dl class="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        <div v-for="row in rows" :key="row.key" class="flex gap-4 px-3 py-2">
          <dt class="w-40 shrink-0 text-sm text-stone-500">{{ row.label }}</dt>
          <dd class="min-w-0 flex-1 text-sm break-words text-stone-900">
            {{ row.value || t('pdf.info.notSet') }}
          </dd>
        </div>
        <div class="flex gap-4 px-3 py-2">
          <dt class="w-40 shrink-0 text-sm text-stone-500">{{ t('pdf.info.pageSizes') }}</dt>
          <dd class="min-w-0 flex-1 text-sm text-stone-900">
            <span v-for="size in sizeSummary" :key="size.label" class="block">
              {{ size.label }}<span v-if="size.count > 1"> × {{ size.count }}</span>
            </span>
          </dd>
        </div>
      </dl>

      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </template>
  </div>
</template>
