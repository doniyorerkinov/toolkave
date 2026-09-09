<script setup lang="ts">
import type { NumberPosition } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const position = ref<NumberPosition>('bottom-center')
const startAt = ref(1)
const fontSize = ref(11)
const skipFirst = ref(false)
const pageCount = ref(0)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    pageCount.value = 0
    infoError.value = false
    if (!current) return
    try {
      pageCount.value = (await readPdfInfo(current)).pageCount
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const positions: NumberPosition[] = ['bottom-center', 'bottom-right', 'bottom-left', 'top-right']

const canRun = computed(() => !!file.value && !!pageCount.value && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await addPageNumbers(file.value, {
      position: position.value,
      startAt: startAt.value,
      fontSize: fontSize.value,
      skipFirst: skipFirst.value
    })
    store.setResult({
      name: withSuffix(file.value.name, '-numbered'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch {
    store.error = t('pdf.errorGeneric')
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
      accept="application/pdf"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <div v-else-if="file && pageCount" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-slate-900">
          {{ t('pdf.pageNumbers.positionLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in positions"
            :key="option"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
            :class="
              position === option
                ? 'border-sky-500 bg-sky-50 text-sky-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            "
          >
            <input v-model="position" type="radio" :value="option" class="sr-only" />
            {{ t(`pdf.pageNumbers.positions.${option}`) }}
          </label>
        </div>
      </fieldset>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="pn-start" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.pageNumbers.startAt') }}
          </label>
          <input
            id="pn-start"
            v-model.number="startAt"
            type="number"
            min="0"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <div>
          <label for="pn-size" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.pageNumbers.fontSize', { n: fontSize }) }}
          </label>
          <input
            id="pn-size"
            v-model.number="fontSize"
            type="range"
            min="8"
            max="24"
            class="mt-3 w-full accent-sky-700"
          />
        </div>
      </div>

      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="skipFirst" type="checkbox" class="size-4 accent-sky-700" />
        {{ t('pdf.pageNumbers.skipFirst') }}
      </label>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.pageNumbers.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
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
