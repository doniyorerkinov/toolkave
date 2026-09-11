<script setup lang="ts">
import { detectEncoding, encodingName, repairText, type RepairCandidate } from '~/utils/encoding'
import { useFilesStore } from '~/stores/files'

/**
 * Repairing text that was read with the wrong character set.
 *
 * Two ways in, because they are genuinely different problems:
 *
 * - Pasted text has already been decoded, so the damage has to be undone by
 *   working out which pair of encodings produced it.
 * - A file still has its original bytes, so there is nothing to undo — the
 *   right character set just has to be identified. That path is lossless and
 *   is the one that fixes a windows-1251 .srt or .csv properly.
 */

const { t } = useI18n()
const store = useFilesStore()

type Mode = 'text' | 'file'
const mode = ref<Mode>('text')

const input = ref('')
const copied = ref(false)
const chosen = ref<RepairCandidate | null>(null)

/* ---- pasted text ---- */

const analysis = computed(() => (input.value ? repairText(input.value) : null))

/** The user's pick wins over the automatic guess until the input changes. */
const output = computed(() => chosen.value?.text ?? analysis.value?.text ?? '')

watch(input, () => {
  chosen.value = null
})

const detectedLabel = computed(() => {
  const best = chosen.value ?? analysis.value?.best
  if (!best) return null
  return best.misread
    ? t('fixEncoding.readAs', { actual: encodingName(best.actual), misread: encodingName(best.misread) })
    : encodingName(best.actual)
})

/** Alternatives, minus whatever is already being shown. */
const alternatives = computed(() =>
  (analysis.value?.candidates ?? []).filter(candidate => candidate.text !== output.value).slice(0, 5)
)

/* ---- uploaded file ---- */

const file = computed(() => store.files[0] ?? null)
const fileEncoding = ref<string | null>(null)
const fileText = ref('')

watch(
  file,
  current => {
    fileEncoding.value = null
    fileText.value = ''
    if (!current) return

    const { best } = detectEncoding(current.data)
    // A file can be valid UTF-8 and still be wrong — that is what happens when
    // someone opens a windows-1251 file in the wrong editor and saves it back.
    const repair = repairText(best.text)

    fileText.value = repair.changed ? repair.text : best.text
    fileEncoding.value = repair.changed
      ? t('fixEncoding.readAs', {
          actual: encodingName(repair.best?.actual ?? best.label),
          misread: encodingName(repair.best?.misread ?? best.label)
        })
      : encodingName(best.label)
  },
  { immediate: true }
)

function saveFile() {
  if (!file.value) return
  store.setResult({
    name: file.value.name.replace(/(\.[^.]+)?$/, '-utf8$1'),
    type: 'text/plain;charset=utf-8',
    data: new TextEncoder().encode(fileText.value),
    sourceSize: file.value.size
  })
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

async function copyOutput() {
  const text = mode.value === 'text' ? output.value : fileText.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Blocked by permissions or an insecure context; the text is selectable.
  }
}

const sample = 'ÐŸÑ€Ð¸Ð²ÐµÑ‚, Ð¼Ð¸Ñ€!'
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-1 rounded-lg bg-stone-100 p-1" role="tablist">
      <button
        v-for="option in (['text', 'file'] as Mode[])"
        :key="option"
        type="button"
        role="tab"
        :aria-selected="mode === option"
        class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition"
        :class="mode === option ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'"
        @click="mode = option"
      >
        {{ t(`fixEncoding.mode.${option}`) }}
      </button>
    </div>

    <!-- Pasted text -->
    <div v-if="mode === 'text'" class="space-y-4">
      <div>
        <label for="fix-in" class="mb-1 block text-sm font-medium text-stone-700">
          {{ t('fixEncoding.inputLabel') }}
        </label>
        <textarea
          id="fix-in"
          v-model="input"
          rows="6"
          spellcheck="false"
          :placeholder="sample"
          class="w-full resize-y rounded-lg border border-stone-300 bg-white p-3 font-mono text-sm text-stone-900 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        />
        <button
          v-if="!input"
          type="button"
          class="mt-1 text-xs text-ember-700 hover:underline"
          @click="input = sample"
        >
          {{ t('fixEncoding.trySample') }}
        </button>
      </div>

      <p
        v-if="input && !analysis?.changed && !chosen"
        class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700"
      >
        {{ t('fixEncoding.looksFine') }}
      </p>

      <div v-if="output && (analysis?.changed || chosen)" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label for="fix-out" class="text-sm font-medium text-stone-700">
            {{ t('fixEncoding.outputLabel') }}
          </label>
          <span v-if="detectedLabel" class="text-xs text-stone-500">{{ detectedLabel }}</span>
        </div>
        <textarea
          id="fix-out"
          :value="output"
          rows="6"
          readonly
          class="w-full resize-y rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 font-mono text-sm text-stone-900"
        />
      </div>

      <div v-if="alternatives.length" class="rounded-lg border border-stone-200 p-3">
        <p class="mb-2 text-sm font-medium text-stone-700">{{ t('fixEncoding.otherReadings') }}</p>
        <ul class="space-y-1">
          <li v-for="candidate in alternatives" :key="`${candidate.actual}/${candidate.misread}`">
            <button
              type="button"
              class="w-full rounded-md border border-stone-200 px-2 py-1.5 text-left text-xs hover:border-ember-300 hover:bg-ember-50"
              @click="chosen = candidate"
            >
              <span class="block truncate font-mono text-stone-900">{{ candidate.text.slice(0, 70) }}</span>
              <span class="text-stone-500">
                {{ encodingName(candidate.actual) }}
                <template v-if="candidate.misread"> → {{ encodingName(candidate.misread) }}</template>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <button
        v-if="output"
        type="button"
        class="rounded-lg bg-ember-700 px-4 py-2 text-sm font-medium text-white hover:bg-ember-800"
        @click="copyOutput"
      >
        {{ copied ? t('fixEncoding.copied') : t('fixEncoding.copy') }}
      </button>
    </div>

    <!-- Uploaded file -->
    <div v-else class="space-y-4">
      <ShellFileDropzone
        v-if="!file"
        accept="text/plain,text/csv,.txt,.csv,.srt,.sub,.json,.md,.log,.ini,.sql"
        :multiple="false"
        @files="onFiles($event)"
      />
      <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

      <p v-if="fileEncoding" class="rounded-lg border border-ember-200 bg-ember-50 px-3 py-2 text-sm text-ember-900">
        {{ t('fixEncoding.detected', { encoding: fileEncoding }) }}
      </p>

      <div v-if="fileText">
        <label for="fix-file-out" class="mb-1 block text-sm font-medium text-stone-700">
          {{ t('fixEncoding.preview') }}
        </label>
        <textarea
          id="fix-file-out"
          :value="fileText.slice(0, 4000)"
          rows="10"
          readonly
          class="w-full resize-y rounded-lg border border-stone-300 bg-white p-3 font-mono text-sm text-stone-900"
        />
      </div>

      <div v-if="file" class="flex flex-wrap gap-2">
        <button
          type="button"
          :disabled="!fileText"
          class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          @click="saveFile"
        >
          {{ t('fixEncoding.saveUtf8') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          @click="store.reset()"
        >
          {{ t('result.startOver') }}
        </button>
      </div>

      <ShellResultCard
        v-if="store.result"
        :result="store.result"
        @reset="store.reset()"
        @chain="store.chainResult()"
      />
    </div>
  </div>
</template>
