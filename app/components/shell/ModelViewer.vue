<script setup lang="ts">
/**
 * The model, turnable.
 *
 * A 3D file is the one kind of output you cannot judge from a thumbnail: the
 * question is always whether the depth is right, whether the holes went
 * through, whether the back is flat. So the preview is the real geometry that
 * will be exported, not a render of it, and it can be turned over.
 *
 * Every three.js object here is held in a plain `let` rather than a ref. Vue
 * would otherwise make a scene graph deeply reactive, which means proxying
 * every vertex it touches — the frame rate goes before anything looks wrong.
 */
import type { Part } from '~~/shared/svg3d'
import { buildGroup, loadThree } from '~/composables/useSvg3d'

const props = defineProps<{ parts: Part[] | null }>()
const emit = defineEmits<{ error: [] }>()

const host = ref<HTMLDivElement | null>(null)
const ready = ref(false)
const spinning = ref(true)

type Three = Awaited<ReturnType<typeof loadThree>>
let T: Three | null = null
let renderer: InstanceType<Three['WebGLRenderer']> | null = null
let scene: InstanceType<Three['Scene']> | null = null
let camera: InstanceType<Three['PerspectiveCamera']> | null = null
let controls: { update(): void; dispose(): void; autoRotate: boolean; target: { set(x: number, y: number, z: number): void } } | null = null
let group: InstanceType<Three['Group']> | null = null
let observer: ResizeObserver | null = null
let raf = 0

/**
 * Build the renderer once, however many callers ask for it.
 *
 * The guard has to be the promise rather than the renderer: the first thing
 * this does is await a dynamic import, and a second caller arriving during
 * that await sees `renderer` still unset and builds a second one. Two canvases
 * stack up, both render every frame, and only the newer one is ever disposed
 * — which quietly burns WebGL contexts until the browser starts dropping them.
 */
let booting: Promise<void> | null = null
function setup() {
  if (!host.value) return Promise.resolve()
  if (!booting) booting = boot()
  return booting
}

async function boot() {
  if (!host.value || renderer) return
  T = await loadThree()
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js')

  scene = new T.Scene()

  // Z is up, because that is how the model was built and how a printer reads
  // it. Telling the camera changes which way "up" is while orbiting; without
  // it the model tips onto its side the moment you drag.
  camera = new T.PerspectiveCamera(38, 1, 0.1, 5000)
  camera.up.set(0, 0, 1)

  scene.add(new T.HemisphereLight(0xffffff, 0x333333, 2.1))
  const key = new T.DirectionalLight(0xffffff, 2.4)
  key.position.set(-80, -140, 180)
  scene.add(key)
  const rim = new T.DirectionalLight(0xffd9b0, 1.1)
  rim.position.set(140, 90, 40)
  scene.add(rim)

  renderer = new T.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearAlpha(0)
  host.value.appendChild(renderer.domElement)
  renderer.domElement.classList.add('block', 'h-full', 'w-full', 'cursor-grab')

  controls = new OrbitControls(camera, renderer.domElement) as unknown as typeof controls
  Object.assign(controls!, {
    enableDamping: true,
    dampingFactor: 0.08,
    autoRotateSpeed: 1.6,
    enablePan: false,
    // The viewer sits in the middle of a long page of controls. Left on, the
    // wheel zooms instead of scrolling past it, and OrbitControls' own
    // `touch-action: none` means a phone cannot scroll past it at all.
    // Sideways drags still turn the model; up and down moves the page.
    enableZoom: false
  })
  renderer.domElement.style.touchAction = 'pan-y'
  renderer.domElement.addEventListener('pointerdown', () => { spinning.value = false }, { once: true })

  observer = new ResizeObserver(resize)
  observer.observe(host.value)
  resize()
  ready.value = true
  tick()
}

function resize() {
  if (!host.value || !renderer || !camera) return
  const { clientWidth, clientHeight } = host.value
  if (!clientWidth || !clientHeight) return
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}

function tick() {
  raf = requestAnimationFrame(tick)
  if (controls) controls.autoRotate = spinning.value
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

/** Materials belong to the viewer; geometry belongs to the model, so only one gets freed here. */
function clearGroup() {
  if (!group || !scene) return
  scene.remove(group)
  group.traverse(child => {
    const material = (child as { material?: { dispose(): void } }).material
    material?.dispose()
  })
  group.clear()
  group = null
}

/**
 * Frame whatever was just built.
 *
 * The camera is placed from the model's own size rather than left where it
 * was, because the same tool produces a 20 mm charm and a 200 mm sign, and a
 * fixed camera shows one as a speck and the other as a wall.
 */
async function show() {
  try {
    await setup()
  } catch {
    emit('error')
    return
  }
  if (!T || !scene || !camera || !controls) return

  clearGroup()
  if (!props.parts?.length) return

  group = await buildGroup(props.parts)
  const box = new T.Box3().setFromObject(group)
  group.position.sub(box.getCenter(new T.Vector3()))
  scene.add(group)

  const radius = Math.max(box.getSize(new T.Vector3()).length() / 2, 1)
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.12
  camera.position.set(0.42, -0.86, 0.46).normalize().multiplyScalar(distance)
  camera.near = distance / 100
  camera.far = distance * 10
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
}

onMounted(() => { void show() })
watch(() => props.parts, () => { void show() })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  clearGroup()
  controls?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
  renderer = null
})

defineExpose({ resetView: show })
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border border-stone-300 bg-on-ink">
    <div ref="host" class="h-72 w-full sm:h-96" />

    <button
      type="button"
      class="absolute bottom-2 right-2 rounded-lg bg-ink/70 px-2.5 py-1.5 text-xs font-medium text-on-ink hover:bg-ink"
      @click="spinning = !spinning"
    >
      {{ spinning ? $t('model.stopSpin') : $t('model.spin') }}
    </button>

    <p v-if="ready" class="pointer-events-none absolute bottom-3 left-3 text-xs text-ink/45">
      {{ $t('model.dragHint') }}
    </p>
  </div>
</template>
