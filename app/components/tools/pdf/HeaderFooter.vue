<script setup lang="ts">
import { UNSUPPORTED_TEXT, isLatin1 } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const header = ref('')
const footer = ref('')
const fontSize = ref(10)
const align = ref<'left' | 'center' | 'right'>('center')
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

const unsupported = computed(
  () => (header.value && !isLatin1(header.value)) || (footer.value && !isLatin1(footer.value))
)
const empty = computed(() => !header.value.trim() && !footer.value.trim())

const canRun = computed(
  () => !!file.value && !!pageCount.value && !empty.value && !unsupported.value && !store.busy
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await addHeaderFooter(file.value, {
      header: header.value,
      footer: footer.value,
      fontSize: fontSize.value,
      align: align.value
    })
    store.setResult({
      name: withSuffix(file.value.name, '-header-footer'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (e) {
    store.error =
      e instanceof Error && e.message === UNSUPPORTED_TEXT
        ? t('pdf.headerFooter.unsupportedText')
        : t('pdf.errorGeneric')
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
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="hf-head" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.headerFooter.headerLabel') }}
          </label>
          <input
            id="hf-head"
            v-model="header"
            type="text"
            maxlength="80"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <div>
          <label for="hf-foot" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.headerFooter.footerLabel') }}
          </label>
          <input
            id="hf-foot"
            v-model="footer"
            type="text"
            maxlength="80"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
      </div>

      <p v-if="unsupported" class="text-sm text-red-700" role="alert">
        {{ t('pdf.headerFooter.unsupportedText') }}
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-slate-900">
            {{ t('pdf.headerFooter.alignLabel') }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['left', 'center', 'right'] as const)"
              :key="option"
              class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
              :class="
                align === option
                  ? 'border-sky-500 bg-sky-50 text-sky-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              "
            >
              <input v-model="align" type="radio" :value="option" class="sr-only" />
              {{ t(`pdf.headerFooter.align.${option}`) }}
            </label>
          </div>
        </fieldset>
        <div>
          <label for="hf-size" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.headerFooter.fontSize', { n: fontSize }) }}
          </label>
          <input
            id="hf-size"
            v-model.number="fontSize"
            type="range"
            min="7"
            max="20"
            class="mt-3 w-full accent-sky-700"
          />
        </div>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.headerFooter.action') }}
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
