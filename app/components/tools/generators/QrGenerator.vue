<script setup lang="ts">
import { MAX_LOGO_SCALE, drawQrArt, layout } from '~~/shared/qr-art'
import { useCropFrame } from '~/composables/useCropFrame'

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
 * The uploaded picture, before it has been squared off.
 *
 * A logo goes into a square hole, so a wide one has to lose something. The
 * alternative — squashing it to fit, or centre-cropping and hoping — throws
 * away the part someone cares about often enough that it is worth one extra
 * step to let them choose.
 */
const raw = shallowRef<ImageBitmap | null>(null)
const cropping = ref(false)
const squareRatio = computed<number | null>(() => 1)

const {
  canvas: cropCanvas,
  source: cropSource,
  cursor: cropCursor,
  load: loadCrop,
  rect: cropRect,
  handlers: cropHandlers
} = useCropFrame({
  ratio: squareRatio,
  maxWidth: 380,
  maxHeight: 320,
  draw(context, box) {
    const el = context.canvas
    context.fillStyle = 'rgba(28, 25, 23, 0.55)'
    context.beginPath()
    context.rect(0, 0, el.width, el.height)
    context.rect(box.x, box.y + box.height, box.width, -box.height)
    context.fill('evenodd')
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.strokeRect(box.x, box.y, box.width, box.height)
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#c2410c'
    for (const [cx, cy] of [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height]
    ] as const) {
      context.beginPath()
      context.arc(cx, cy, 5.5, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  }
})

/** Whether the finished image still reads as a QR code. Checked, not assumed. */
const scannable = ref<boolean | null>(null)
const checking = ref(false)

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
    raw.value?.close()
    raw.value = await createImageBitmap(file)
    logoName.value = file.name
    cropping.value = true
    await nextTick()
    await loadCrop({ data: new Uint8Array(await file.arrayBuffer()) })
  } catch {
    error.value = t('qr.logoFailed')
    cropping.value = false
  }
}

/** Cut the chosen square out at full resolution and keep that as the logo. */
async function useSquare() {
  const picture = raw.value
  if (!picture) return
  const box = cropRect()
  const side = Math.max(1, Math.round(Math.min(box.width, box.height)))
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (!context) return
  context.drawImage(picture, box.x, box.y, side, side, 0, 0, side, side)
  logo.value?.close()
  logo.value = await createImageBitmap(canvas)
  canvas.width = 0
  canvas.height = 0
  cropping.value = false
  render()
}

function cancelCrop() {
  cropping.value = false
  if (!logo.value) logoName.value = null
}

function clearLogo() {
  logo.value?.close()
  logo.value = null
  raw.value?.close()
  raw.value = null
  logoName.value = null
  cropping.value = false
  scannable.value = null
  render()
}

/**
 * Read the finished image back with a decoder.
 *
 * This is what lets the logo be as large as it can be rather than as large
 * as the worst imaginable payload allows: how much room there is depends
 * entirely on what is encoded, so the honest answer is to look.
 */
async function check(url: string) {
  checking.value = true
  try {
    const { default: jsQR } = await import('jsqr')
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    bitmap.close()
    canvas.width = 0
    canvas.height = 0
    scannable.value = jsQR(pixels.data, pixels.width, pixels.height)?.data === text.value
  } catch {
    scannable.value = null
  } finally {
    checking.value = false
  }
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
      scannable.value = null
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
    if (logo.value) void check(dataUrl.value)
    else scannable.value = null
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
  raw.value?.close()
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
        <label class="inline-flex cursor-pointer items-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100">
          {{ hasLogo ? t('qr.logoChange') : t('qr.logoAdd') }}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" @change="onLogo" />
        </label>
        <span v-if="logoName" class="min-w-0 truncate text-sm text-stone-600">{{ logoName }}</span>
        <button
          v-if="hasLogo"
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="clearLogo"
        >
          {{ t('qr.logoRemove') }}
        </button>
      </div>

      <div v-if="cropping" class="mt-3 space-y-2">
        <p class="text-sm text-stone-700">{{ t('qr.cropHint') }}</p>
        <div class="flex justify-center rounded-lg border border-stone-200 bg-stone-100 p-2">
          <canvas
            ref="cropCanvas"
            class="max-w-full touch-none rounded-sm bg-white shadow-sm select-none"
            :style="{ cursor: cropCursor }"
            v-bind="cropHandlers"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            :disabled="!cropSource"
            class="rounded-lg bg-ember-700 px-4 py-2 text-sm font-medium text-white hover:bg-ember-800 disabled:bg-stone-300"
            @click="useSquare"
          >
            {{ t('qr.cropUse') }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
            @click="cancelCrop"
          >
            {{ t('qr.cropCancel') }}
          </button>
        </div>
      </div>

      <div v-else-if="hasLogo" class="mt-3">
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

        <p
          v-if="checking"
          class="mt-2 text-sm text-stone-500"
        >
          {{ t('qr.checking') }}
        </p>
        <p
          v-else-if="scannable === true"
          class="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
        >
          {{ t('qr.scansOk') }}
        </p>
        <p
          v-else-if="scannable === false"
          class="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
          role="alert"
        >
          {{ t('qr.scansFail') }}
        </p>

        <p class="mt-1 text-xs text-stone-500">{{ t('qr.logoNote') }}</p>
        <button
          type="button"
          class="mt-2 text-xs font-medium text-ember-700 underline underline-offset-2 hover:text-ember-800"
          @click="cropping = true"
        >
          {{ t('qr.cropAgain') }}
        </button>
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
