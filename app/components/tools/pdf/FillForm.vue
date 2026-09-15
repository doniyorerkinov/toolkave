<script setup lang="ts">
import type { FormField } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const fields = ref<FormField[]>([])
const values = ref<Record<string, string>>({})
const flatten = ref(false)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    fields.value = []
    values.value = {}
    infoError.value = false
    if (!current) return
    try {
      const found = await readFormFields(current)
      fields.value = found
      values.value = Object.fromEntries(found.map(field => [field.name, field.value]))
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

/** Fields pdf-lib exposes but cannot meaningfully edit here. */
const editable = computed(() => fields.value.filter(field => field.type !== 'other'))

const canRun = computed(() => !!file.value && editable.value.length > 0 && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await fillForm(file.value, values.value, flatten.value)
    store.setResult({
      name: withSuffix(file.value.name, '-filled'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
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

    <p
      v-else-if="file && !fields.length"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {{ t('pdf.fillForm.noFields') }}
    </p>

    <template v-else-if="editable.length">
      <p class="text-sm text-stone-500">{{ t('pdf.fillForm.found', { n: editable.length }) }}</p>

      <div class="space-y-3">
        <div v-for="field in editable" :key="field.name">
          <label :for="`ff-${field.name}`" class="block text-sm font-medium break-words text-stone-900">
            {{ field.name }}
          </label>

          <input
            v-if="field.type === 'text'"
            :id="`ff-${field.name}`"
            v-model="values[field.name]"
            type="text"
            class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
          />

          <label
            v-else-if="field.type === 'checkbox'"
            class="mt-1 flex items-center gap-2 text-sm text-stone-700"
          >
            <input
              :id="`ff-${field.name}`"
              type="checkbox"
              :checked="values[field.name] === 'on'"
              class="size-4 accent-ember-700"
              @change="values[field.name] = ($event.target as HTMLInputElement).checked ? 'on' : ''"
            />
            {{ t('pdf.fillForm.checked') }}
          </label>

          <select
            v-else
            :id="`ff-${field.name}`"
            v-model="values[field.name]"
            class="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2 outline-none focus:border-ember-500"
          >
            <option value="">{{ t('pdf.fillForm.notSelected') }}</option>
            <option v-for="option in field.options" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>

      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="flatten" type="checkbox" class="size-4 accent-ember-700" />
        {{ t('pdf.fillForm.flatten') }}
      </label>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.fillForm.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
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
