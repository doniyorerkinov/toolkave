<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const panel = ref<HTMLElement | null>(null)
const confirmButton = ref<HTMLElement | null>(null)

/**
 * Focus moves into the dialog when it opens and returns to whatever had it
 * when the dialog closes, so a keyboard user is not dropped at the top of the
 * document. Tab is kept inside the panel while it is open.
 */
let previouslyFocused: HTMLElement | null = null

watch(
  () => props.open,
  async isOpen => {
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      await nextTick()
      confirmButton.value?.focus()
    } else {
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  }
)

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }

  if (event.key !== 'Tab' || !panel.value) return

  const focusable = panel.value.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      @click.self="emit('cancel')"
    >
      <div
        ref="panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="confirm-title" class="text-lg font-semibold text-slate-900">{{ title }}</h2>
        <p id="confirm-body" class="mt-2 text-sm leading-relaxed text-slate-600">{{ body }}</p>

        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
