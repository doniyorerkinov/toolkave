<script setup lang="ts">
import { NOT_ENCRYPTED, WRONG_PASSWORD } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const password = ref('')
const encrypted = ref<boolean | null>(null)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    encrypted.value = null
    infoError.value = false
    if (!current) return
    try {
      encrypted.value = await isPdfEncrypted(current)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const canRun = computed(() => !!file.value && encrypted.value === true && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    // An empty password is valid for owner-password-only files, so it is passed
    // through rather than treated as "no password given".
    const data = await unlockPdf(file.value, password.value)
    store.setResult({
      name: withSuffix(file.value.name, '-unlocked'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (e) {
    const code = e instanceof Error ? e.message : ''
    store.error =
      code === WRONG_PASSWORD
        ? t('pdf.unlock.wrongPassword')
        : code === NOT_ENCRYPTED
          ? t('pdf.unlock.notEncrypted')
          : t('pdf.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  password.value = ''
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

    <p
      v-else-if="encrypted === false"
      class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
    >
      {{ t('pdf.unlock.notEncrypted') }}
    </p>

    <div v-else-if="encrypted === true">
      <label for="ul-pw" class="block text-sm font-medium text-slate-900">
        {{ t('pdf.unlock.password') }}
      </label>
      <input
        id="ul-pw"
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
      <p class="mt-1 text-sm text-slate-500">{{ t('pdf.unlock.emptyHint') }}</p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.unlock.action') }}
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
