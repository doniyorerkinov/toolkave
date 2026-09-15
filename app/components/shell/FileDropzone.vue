<script lang="ts">
/**
 * Every dropzone on the page, in mount order. A paste has no target zone of
 * its own, so with two zones mounted (Compare PDF) it would otherwise land in
 * both. A paste inside a zone goes to that zone; anywhere else, to the first.
 */
const mountedZones: HTMLElement[] = []
</script>

<script setup lang="ts">
import { formatBytes } from '~/utils/formatters'
import { acceptAttribute, acceptLabel, matchesAccept } from '~~/shared/file-types'

const props = withDefaults(
  defineProps<{
    accept?: string
    multiple?: boolean
    maxFiles?: number
    maxSize?: number
  }>(),
  {
    accept: 'application/pdf',
    multiple: true,
    maxFiles: 50,
    maxSize: 100 * 1024 * 1024
  }
)

const emit = defineEmits<{ files: [File[]] }>()

const { t } = useI18n()
const dragging = ref(false)
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const rejected = ref<string | null>(null)

/** "MP4, MOV, AVI, MKV" — the formats named the way people know them. */
const acceptedLabel = computed(() => acceptLabel(props.accept))

/**
 * What the OS file picker will let through. Extensions are added to the MIME
 * types, or a `.mkv` is greyed out in the dialog on any machine whose type
 * registry has never heard of Matroska — which is most of them.
 */
const acceptAttr = computed(() => acceptAttribute(props.accept))

const accepts = (file: File) => matchesAccept(file, props.accept)

function handle(list: FileList | null | undefined) {
  if (!list?.length) return
  rejected.value = null

  const incoming = [...list]
  const wrongType = incoming.filter(f => !accepts(f))
  const tooBig = incoming.filter(f => f.size > props.maxSize)
  const accepted = incoming.filter(f => accepts(f) && f.size <= props.maxSize)

  if (wrongType.length) {
    rejected.value = t('dropzone.wrongType', { formats: acceptedLabel.value })
  } else if (tooBig.length) {
    rejected.value = t('dropzone.tooBig', { size: formatBytes(props.maxSize) })
  }

  if (accepted.length) emit('files', accepted.slice(0, props.maxFiles))
}

function onDrop(event: DragEvent) {
  dragging.value = false
  handle(event.dataTransfer?.files)
}

function onPaste(event: ClipboardEvent) {
  const zone = root.value
  if (!zone) return
  const target = event.target instanceof Node ? event.target : null
  const owner = mountedZones.find(el => target !== null && el.contains(target)) ?? mountedZones[0]
  if (owner !== zone) return
  handle(event.clipboardData?.files)
}

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  handle(target.files)
  // Reset so selecting the same file twice still fires a change event.
  target.value = ''
}

onMounted(() => {
  if (root.value) mountedZones.push(root.value)
  window.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  const index = root.value ? mountedZones.indexOf(root.value) : -1
  if (index !== -1) mountedZones.splice(index, 1)
  window.removeEventListener('paste', onPaste)
})
</script>

<template>
  <div ref="root">
    <button
      type="button"
      class="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition"
      :class="
        dragging
          ? 'border-ember-500 bg-ember-50'
          : 'border-stone-300 bg-stone-50 hover:border-ember-400 hover:bg-ember-50/50'
      "
      @click="input?.click()"
      @dragover.prevent="dragging = true"
      @dragenter.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="text-base font-medium text-stone-900">{{ t('dropzone.title') }}</span>
      <span class="text-sm text-stone-500">{{ t('dropzone.hint') }}</span>
      <span class="text-xs text-stone-500">
        {{ acceptedLabel }} · {{ t('dropzone.maxSize', { size: formatBytes(maxSize) }) }}
      </span>
    </button>

    <input
      ref="input"
      type="file"
      class="hidden"
      :accept="acceptAttr"
      :multiple="multiple"
      @change="onChange"
    />

    <p v-if="rejected" class="mt-2 text-sm text-red-700" role="alert">{{ rejected }}</p>
  </div>
</template>
