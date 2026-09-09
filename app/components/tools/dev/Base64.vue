<script setup lang="ts">
const { t } = useI18n()

type Mode = 'encode' | 'decode'
const mode = ref<Mode>('encode')
const urlSafe = ref(false)
const input = ref('')
const copied = ref(false)

/**
 * btoa/atob only handle Latin-1, so anything outside it - Cyrillic, Uzbek
 * apostrophes, emoji - has to go through TextEncoder first. This is the bug
 * most quick Base64 tools ship with, and the reason the FAQ mentions it.
 */
function encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const base = btoa(binary)
  return urlSafe.value ? base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : base
}

function decode(text: string): string {
  let normalised = text.trim().replace(/-/g, '+').replace(/_/g, '/')
  // Restore stripped padding, which URL-safe encoders usually drop.
  if (normalised.length % 4) normalised += '='.repeat(4 - (normalised.length % 4))
  const binary = atob(normalised)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const output = computed(() => {
  if (!input.value) return { text: '', error: '' }
  try {
    return { text: mode.value === 'encode' ? encode(input.value) : decode(input.value), error: '' }
  } catch {
    return { text: '', error: t('base64.invalid') }
  }
})

function swap() {
  const previous = output.value.text
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  if (previous) input.value = previous
}

async function copy() {
  if (!output.value.text) return
  try {
    await navigator.clipboard.writeText(output.value.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard can be blocked; the output stays selectable.
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-lg border border-slate-300 p-0.5">
        <label
          v-for="option in (['encode', 'decode'] as Mode[])"
          :key="option"
          class="cursor-pointer rounded px-3 py-1.5 text-sm font-medium"
          :class="mode === option ? 'bg-sky-700 text-white' : 'text-slate-700 hover:bg-slate-50'"
        >
          <input v-model="mode" type="radio" :value="option" class="sr-only" />
          {{ t(`base64.${option}`) }}
        </label>
      </div>

      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="urlSafe" type="checkbox" class="size-4 accent-sky-700" />
        {{ t('base64.urlSafe') }}
      </label>

      <button
        type="button"
        class="ms-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        @click="swap"
      >
        {{ t('base64.swap') }}
      </button>
    </div>

    <div>
      <label for="b64-in" class="mb-1 block text-sm font-medium text-slate-900">
        {{ t('base64.inputLabel') }}
      </label>
      <textarea
        id="b64-in"
        v-model="input"
        rows="5"
        spellcheck="false"
        :placeholder="t(`base64.placeholder.${mode}`)"
        class="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <label for="b64-out" class="block text-sm font-medium text-slate-900">
          {{ t('base64.outputLabel') }}
        </label>
        <button
          type="button"
          :disabled="!output.text"
          class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          @click="copy"
        >
          {{ copied ? t('wordCounter.copied') : t('wordCounter.copy') }}
        </button>
      </div>
      <textarea
        id="b64-out"
        :value="output.text"
        rows="5"
        readonly
        spellcheck="false"
        class="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900"
      />
      <p v-if="output.error" class="mt-1 text-sm text-red-700" role="alert">{{ output.error }}</p>
    </div>
  </div>
</template>
