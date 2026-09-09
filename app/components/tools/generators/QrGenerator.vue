<script setup lang="ts">
const { t } = useI18n()

const text = ref('')
const size = ref(512)
const margin = ref(2)
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const dataUrl = ref('')
const error = ref('')
const busy = ref(false)

/** `qrcode` is ~50 KB, so it loads only once something has been typed. */
async function render() {
  if (!text.value.trim()) {
    dataUrl.value = ''
    error.value = ''
    return
  }
  busy.value = true
  try {
    const QR = await import('qrcode')
    dataUrl.value = await QR.toDataURL(text.value, {
      width: size.value,
      margin: margin.value,
      errorCorrectionLevel: level.value,
      color: { dark: '#000000', light: '#ffffff' }
    })
    error.value = ''
  } catch {
    // The only realistic failure is exceeding the format's capacity, which
    // depends on the error-correction level as much as the length.
    dataUrl.value = ''
    error.value = t('qr.tooLong')
  } finally {
    busy.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([text, size, margin, level], () => {
  clearTimeout(timer)
  timer = setTimeout(render, 200)
})
onBeforeUnmount(() => clearTimeout(timer))

function download() {
  if (!dataUrl.value) return
  const link = document.createElement('a')
  link.href = dataUrl.value
  link.download = 'qr-code.png'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <label for="qr-text" class="mb-1 block text-sm font-medium text-slate-900">
        {{ t('qr.inputLabel') }}
      </label>
      <textarea
        id="qr-text"
        v-model="text"
        rows="3"
        :placeholder="t('qr.placeholder')"
        class="w-full resize-y rounded-lg border border-slate-300 p-3 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div>
        <label for="qr-size" class="block text-sm font-medium text-slate-900">
          {{ t('qr.size', { n: size }) }}
        </label>
        <input
          id="qr-size"
          v-model.number="size"
          type="range"
          min="128"
          max="1024"
          step="64"
          class="mt-2 w-full accent-sky-700"
        />
      </div>
      <div>
        <label for="qr-margin" class="block text-sm font-medium text-slate-900">
          {{ t('qr.margin', { n: margin }) }}
        </label>
        <input
          id="qr-margin"
          v-model.number="margin"
          type="range"
          min="0"
          max="8"
          class="mt-2 w-full accent-sky-700"
        />
      </div>
      <div>
        <label for="qr-level" class="block text-sm font-medium text-slate-900">
          {{ t('qr.level') }}
        </label>
        <select
          id="qr-level"
          v-model="level"
          class="mt-2 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-sky-500"
        >
          <option value="L">{{ t('qr.levels.L') }}</option>
          <option value="M">{{ t('qr.levels.M') }}</option>
          <option value="Q">{{ t('qr.levels.Q') }}</option>
          <option value="H">{{ t('qr.levels.H') }}</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>

    <div v-if="dataUrl" class="flex flex-col items-start gap-3">
      <img
        :src="dataUrl"
        :alt="t('qr.alt')"
        class="max-w-full rounded-lg border border-slate-200 bg-white"
        width="256"
        height="256"
      />
      <button
        type="button"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800"
        @click="download"
      >
        {{ t('qr.download') }}
      </button>
    </div>

    <p v-else-if="!text.trim()" class="text-sm text-slate-500">{{ t('qr.empty') }}</p>
  </div>
</template>
