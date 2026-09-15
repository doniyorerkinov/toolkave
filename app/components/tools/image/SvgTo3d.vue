<script setup lang="ts">
/**
 * A flat drawing, given a thickness.
 *
 * The gap between an SVG and a printable model is mostly a question of units.
 * An SVG is drawn in coordinates that mean nothing physically; a 3D print is
 * millimetres or it is nothing. So every control here is in millimetres, and
 * the numbers under the preview are the numbers a slicer will show.
 *
 * Two passes, deliberately separate. Reading the file into outlines is the
 * slow part and only depends on how finely curves are sampled, so dragging
 * the thickness slider re-extrudes without re-reading — which is the
 * difference between a preview that follows the slider and one that stutters.
 */
import { buildModel, DEFAULTS, type Layer, type Model } from '~~/shared/svg3d'
import { exportModel, parseSvg, FORMATS, type ModelFormat, type SvgScene } from '~/composables/useSvg3d'
import { isSvg } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

/** How finely curves are sampled. The only control that costs triangles. */
const QUALITY = { draft: 4, normal: 10, fine: 22 } as const
type Quality = keyof typeof QUALITY

const size = ref(DEFAULTS.size)
const depth = ref(DEFAULTS.depth)
const bevelled = ref(false)
const plated = ref(false)
const plate = ref(1.6)
const quality = ref<Quality>('normal')
const strokes = ref(true)
const format = ref<ModelFormat>('stl')

const scene = shallowRef<SvgScene | null>(null)
const model = shallowRef<Model | null>(null)
const parsing = ref(false)
const failed = ref(false)

const file = computed(() => store.files[0] ?? null)
const parts = computed(() => model.value?.parts ?? null)

/** A chamfer that would eat the whole thickness is not a chamfer. */
const bevel = computed(() => (bevelled.value ? Math.min(0.6, depth.value / 4) : 0))

const options = computed(() => ({
  size: size.value,
  depth: depth.value,
  bevel: bevel.value,
  base: plated.value ? plate.value : 0,
  baseMargin: DEFAULTS.baseMargin
}))

/** Set when the drawing is outlines only, so the toggle can explain itself. */
const strokeOnly = computed(() => !!scene.value && !scene.value.hasFill && scene.value.hasStroke)

async function read() {
  scene.value = null
  model.value = null
  if (!file.value) return
  if (!isSvg(file.value.data)) {
    store.error = t('image.svg3d.notSvg')
    return
  }

  parsing.value = true
  store.error = null
  try {
    const text = new TextDecoder().decode(file.value.data)
    scene.value = await parseSvg(text, { strokes: strokes.value, divisions: QUALITY[quality.value] })
    if (!scene.value.layers.length) {
      store.error = scene.value.hasStroke ? t('image.svg3d.strokesOff') : t('image.svg3d.nothingToExtrude')
    }
    build()
  } catch {
    store.error = t('image.svg3d.readFailed')
  } finally {
    parsing.value = false
  }
}

function build() {
  const layers: Layer[] = scene.value?.layers ?? []
  model.value = layers.length ? buildModel(layers, options.value) : null
}

let timer: ReturnType<typeof setTimeout> | undefined
function rebuildSoon() {
  clearTimeout(timer)
  timer = setTimeout(build, 120)
}

watch(file, read, { immediate: true })
watch([quality, strokes], read)
watch(options, rebuildSoon)
onBeforeUnmount(() => clearTimeout(timer))

async function download() {
  if (!parts.value || !file.value || store.busy) return
  store.busy = true
  store.error = null
  try {
    const data = await exportModel(parts.value, format.value)
    const measured = model.value!.size
    store.setResult({
      name: withSuffix(file.value.name, '', FORMATS[format.value].extension),
      type: FORMATS[format.value].mime,
      data,
      sourceSize: file.value.size,
      note: t('model.note', {
        w: measured.x.toFixed(1),
        h: measured.y.toFixed(1),
        d: measured.z.toFixed(1),
        n: model.value!.triangles.toLocaleString()
      })
    })
  } catch {
    store.error = t('model.exportFailed')
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
      accept="image/svg+xml"
      :multiple="false"
      :max-size="10 * 1024 * 1024"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <template v-if="file">
      <ShellModelViewer :parts="parts" @error="failed = true" />

      <p v-if="failed" class="text-sm text-red-700" role="alert">{{ t('model.noWebgl') }}</p>

      <p v-else-if="model" class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
        <span class="tabular-nums">
          {{ model.size.x.toFixed(1) }} × {{ model.size.y.toFixed(1) }} × {{ model.size.z.toFixed(1) }} mm
        </span>
        <span class="tabular-nums">{{ t('model.triangles', { n: model.triangles.toLocaleString() }) }}</span>
        <span>{{ formatBytes(file.size) }}</span>
      </p>
      <p v-else-if="parsing" class="text-sm text-stone-500">{{ t('image.svg3d.reading') }}</p>

      <label
        v-if="scene?.hasStroke"
        class="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700"
      >
        <input v-model="strokes" type="checkbox" :disabled="strokeOnly" class="mt-0.5 size-4 accent-ember-700" />
        <span>
          {{ t('image.svg3d.strokes') }}
          <span class="block text-xs text-stone-500">
            {{ strokeOnly ? t('image.svg3d.strokesOnly') : t('image.svg3d.strokesNote') }}
          </span>
        </span>
      </label>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.svg3d.qualityLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['draft', 'normal', 'fine'] as const)"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              quality === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
          >
            <input v-model="quality" type="radio" :value="option" class="sr-only" />
            {{ t(`image.svg3d.quality.${option}`) }}
          </label>
        </div>
        <p class="mt-2 text-xs text-stone-500">{{ t('image.svg3d.qualityNote') }}</p>
      </fieldset>

      <ShellModelOptions
        v-model:size="size"
        v-model:depth="depth"
        v-model:bevelled="bevelled"
        v-model:plated="plated"
        v-model:plate="plate"
        v-model:format="format"
        :model="model"
        :busy="store.busy"
        @build="download"
        @reset="store.reset()"
      />
    </template>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
