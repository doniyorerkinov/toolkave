<script setup lang="ts">
/**
 * UUIDs from the browser's own generator.
 *
 * `crypto.randomUUID` is a v4 from the platform CSPRNG. Writing one by hand
 * from Math.random is the classic mistake: it looks identical and is
 * predictable, which matters the moment somebody uses one as a token.
 */
const { t } = useI18n()

const count = ref(5)
const uppercase = ref(false)
const hyphens = ref(true)
const list = ref<string[]>([])
const copied = ref(false)

function generate() {
  const made = Array.from({ length: Math.min(500, Math.max(1, count.value)) }, () => crypto.randomUUID())
  list.value = made.map(id => {
    const shaped = hyphens.value ? id : id.replace(/-/g, '')
    return uppercase.value ? shaped.toUpperCase() : shaped
  })
}

onMounted(generate)
watch([uppercase, hyphens], generate)

async function copyAll() {
  await navigator.clipboard.writeText(list.value.join('\n'))
  copied.value = true
  setTimeout(() => (copied.value = false), 1400)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <label for="uuid-count" class="block text-sm font-medium text-stone-900">{{ t('devtools.howMany') }}</label>
        <input id="uuid-count" v-model.number="count" type="number" min="1" max="500"
          class="mt-2 w-28 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
      </div>
      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="hyphens" type="checkbox" class="accent-ember-700" />{{ t('devtools.hyphens') }}
      </label>
      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="uppercase" type="checkbox" class="accent-ember-700" />{{ t('devtools.uppercase') }}
      </label>
      <button type="button" class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700" @click="generate">
        {{ t('devtools.generate') }}
      </button>
      <button v-if="list.length" type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50" @click="copyAll">
        {{ copied ? t('devtools.copied') : t('devtools.copyAll') }}
      </button>
    </div>

    <ul v-if="list.length" class="scroll-thin max-h-96 overflow-y-auto rounded-lg border border-stone-300 bg-white divide-y divide-stone-200">
      <li v-for="id in list" :key="id" class="px-3 py-2 font-mono text-sm break-all text-stone-900">{{ id }}</li>
    </ul>
  </div>
</template>
