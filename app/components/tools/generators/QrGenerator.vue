<script setup lang="ts">
import { MAX_LOGO_SCALE, drawQrArt, layout } from '~~/shared/qr-art'

const { t } = useI18n()

const text = ref('')
const size = ref(512)
const margin = ref(2)
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const dataUrl = ref('')
const error = ref('')
const busy = ref(false)

const above = ref('')
const below = ref('')
const logoScale = ref(0.18)
const logoName = ref<string | null>(null)
/**
 * A ref, not a plain variable: the error-correction level is computed from
 * whether a logo exists, and a plain variable changes without the computed
 * ever hearing about it. That shipped a code generated at the level chosen
 * before the logo was added — it looked right, showed the notice saying the
 * level had been raised, and did not scan.
 */
const logo = shallowRef<ImageBitmap | null>(null)

/**
 * A logo is paid for out of the error-correction budget, so it is only
 * honest to spend the largest one. Forced rather than suggested: a code
 * that scans on the screen you made it on and fails on a printed flyer is
 * the failure this tool exists to avoid.
 */
const forcedLevel = computed<'L' | 'M' | 'Q' | 'H'>(() => (logo.value ? 'H' : level.value))
const hasLogo = computed(() => !!logo.value)

async function onLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    logo.value?.close()
    logo.value = await createImageBitmap(file)
    logoName.value = file.name
    render()
  } catch {
    error.value = t('qr.logoFailed')
  }
}

function clearLogo() {
  logo.value?.close()
  logo.value = null
  logoName.value = null
  render()
}

/** `qrcode` is ~50 KB, so it loads only once something has been typed. */
async function render() {
  if (!text.value.trim()) {
    dataUrl.value = ''
    error.value = ''
    return
  }
  busy.value = true
  try {
    if (import.meta.server) throw new Error('browser only')
    const QR = await import('qrcode')
    const plain = await QR.toDataURL(text.value, {
      width: size.value,
      margin: margin.value,
      errorCorrectionLevel: forcedLevel.value,
      color: { dark: '#000000', light: '#ffffff' }
    })

    // Nothing added means nothing to redraw, and re-encoding a PNG for no
    // reason only loses a little to the round trip.
    if (!logo.value && !above.value.trim() && !below.value.trim()) {
      dataUrl.value = plain
      error.value = ''
      return
    }

    const code = await createImageBitmap(await (await fetch(plain)).blob())
    const options = {
      qr: code,
      qrSize: size.value,
      logo: logo.value
        ? { image: logo.value, width: logo.value.width, height: logo.value.height }
        : null,
      logoScale: logoScale.value,
      above: above.value,
      below: below.value
    }
    const plan = layout(options)
    const canvas = document.createElement('canvas')
    canvas.width = plan.width
    canvas.height = plan.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    drawQrArt(context as unknown as Parameters<typeof drawQrArt>[0], options)
    code.close()
    dataUrl.value = canvas.toDataURL('image/png')
    canvas.width = 0
    canvas.height = 0
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
watch([text, size, margin, level, above, below, logoScale], () => {
  clearTimeout(timer)
  timer = setTimeout(render, 200)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  logo.value?.close()
})

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
      <label for="qr-text" class="mb-1 block text-sm font-medium text-stone-900">
        {{ t('qr.inputLabel') }}
      </label>
      <textarea
        id="qr-text"
        v-model="text"
        rows="3"
        :placeholder="t('qr.placeholder')"
        class="w-full resize-y rounded-lg border border-stone-300 p-3 text-stone-900 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div>
        <label for="qr-size" class="block text-sm font-medium text-stone-900">
          {{ t('qr.size', { n: size }) }}
        </label>
        <input
          id="qr-size"
          v-model.number="size"
          type="range"
          min="128"
          max="1024"
          step="64"
          class="mt-2 w-full accent-ember-700"
        />
      </div>
      <div>
        <label for="qr-margin" class="block text-sm font-medium text-stone-900">
          {{ t('qr.margin', { n: margin }) }}
        </label>
        <input
          id="qr-margin"
          v-model.number="margin"
          type="range"
          min="0"
          max="8"
          class="mt-2 w-full accent-ember-700"
        />
      </div>
      <div>
        <label for="qr-level" class="block text-sm font-medium text-stone-900">
          {{ t('qr.level') }}
        </label>
        <select
          id="qr-level"
          :value="forcedLevel"
          :disabled="hasLogo"
          class="mt-2 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm outline-none focus:border-ember-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
          @change="level = ($event.target as HTMLSelectElement).value as 'L' | 'M' | 'Q' | 'H'"
        >
          <option value="L">{{ t('qr.levels.L') }}</option>
          <option value="M">{{ t('qr.levels.M') }}</option>
          <option value="Q">{{ t('qr.levels.Q') }}</option>
          <option value="H">{{ t('qr.levels.H') }}</option>
        </select>
        <p v-if="hasLogo" class="mt-1 text-xs text-amber-800">{{ t('qr.levelForced') }}</p>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="qr-above" class="block text-sm font-medium text-stone-900">{{ t('qr.above') }}</label>
        <input
          id="qr-above"
          v-model="above"
          type="text"
          maxlength="40"
          :placeholder="t('qr.abovePlaceholder')"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500"
        />
      </div>
      <div>
        <label for="qr-below" class="block text-sm font-medium text-stone-900">{{ t('qr.below') }}</label>
        <input
          id="qr-below"
          v-model="below"
          type="text"
          maxlength="40"
          :placeholder="t('qr.belowPlaceholder')"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500"
        />
      </div>
    </div>

    <div class="rounded-xl border border-stone-200 p-3">
      <div class="flex flex-wrap items-center gap-2">
        <label class="inline-flex cursor-pointer items-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
          {{ hasLogo ? t('qr.logoChange') : t('qr.logoAdd') }}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" @change="onLogo" />
        </label>
        <span v-if="logoName" class="min-w-0 truncate text-sm text-stone-600">{{ logoName }}</span>
        <button
          v-if="hasLogo"
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          @click="clearLogo"
        >
          {{ t('qr.logoRemove') }}
        </button>
      </div>

      <div v-if="hasLogo" class="mt-3">
        <label for="qr-logo-size" class="block text-sm font-medium text-stone-900">
          {{ t('qr.logoSize', { n: Math.round(logoScale * 100) }) }}
        </label>
        <input
          id="qr-logo-size"
          v-model.number="logoScale"
          type="range"
          min="0.08"
          :max="MAX_LOGO_SCALE"
          step="0.01"
          class="mt-2 w-full accent-ember-700"
        />
        <p class="mt-1 text-xs text-stone-500">{{ t('qr.logoNote') }}</p>
      </div>
      <p v-else class="mt-2 text-xs text-stone-500">{{ t('qr.logoHint') }}</p>
    </div>

    <div v-if="dataUrl" class="flex flex-col items-start gap-3">
      <img
        :src="dataUrl"
        :alt="t('qr.alt')"
        class="max-w-full rounded-lg border border-stone-200 bg-white"
        width="256"
        height="256"
      />
      <button
        type="button"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800"
        @click="download"
      >
        {{ t('qr.download') }}
      </button>
    </div>

    <p v-else-if="!text.trim()" class="text-sm text-stone-500">{{ t('qr.empty') }}</p>
  </div>
</template>
