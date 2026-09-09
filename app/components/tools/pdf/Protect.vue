<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const password = ref('')
const confirm = ref('')
const alreadyEncrypted = ref(false)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    alreadyEncrypted.value = false
    infoError.value = false
    if (!current) return
    try {
      alreadyEncrypted.value = await isPdfEncrypted(current)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const mismatch = computed(() => confirm.value.length > 0 && password.value !== confirm.value)
const tooShort = computed(() => password.value.length > 0 && password.value.length < 4)

const canRun = computed(
  () =>
    !!file.value &&
    !alreadyEncrypted.value &&
    password.value.length >= 4 &&
    password.value === confirm.value &&
    !store.busy
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await protectPdf(file.value, password.value)
    store.setResult({
      name: withSuffix(file.value.name, '-protected'),
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
  password.value = ''
  confirm.value = ''
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
      v-else-if="alreadyEncrypted"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      role="alert"
    >
      {{ t('pdf.protect.alreadyEncrypted') }}
    </p>

    <div v-else-if="file" class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="pr-pw" class="block text-sm font-medium text-slate-900">
          {{ t('pdf.protect.password') }}
        </label>
        <input
          id="pr-pw"
          v-model="password"
          type="password"
          autocomplete="new-password"
          class="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-200"
          :class="tooShort ? 'border-red-400' : 'border-slate-300 focus:border-sky-500'"
        />
        <p v-if="tooShort" class="mt-1 text-sm text-red-700">{{ t('pdf.protect.tooShort') }}</p>
      </div>
      <div>
        <label for="pr-confirm" class="block text-sm font-medium text-slate-900">
          {{ t('pdf.protect.confirm') }}
        </label>
        <input
          id="pr-confirm"
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          class="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-200"
          :class="mismatch ? 'border-red-400' : 'border-slate-300 focus:border-sky-500'"
        />
        <p v-if="mismatch" class="mt-1 text-sm text-red-700">{{ t('pdf.protect.mismatch') }}</p>
      </div>
    </div>

    <p v-if="file && !alreadyEncrypted" class="text-sm text-amber-800">
      {{ t('pdf.protect.warning') }}
    </p>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.protect.action') }}
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
