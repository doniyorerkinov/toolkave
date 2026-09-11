<script setup lang="ts">
const { t } = useI18n()

const url = ref('')

/**
 * Extract the 11-character video id from any of YouTube's URL shapes:
 * watch?v=, youtu.be/, /embed/, /shorts/, /live/, or a bare id.
 */
function extractId(input: string): string | null {
  const text = input.trim()
  if (!text) return null

  if (/^[\w-]{11}$/.test(text)) return text

  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/live\/([\w-]{11})/,
    /\/v\/([\w-]{11})/
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

const videoId = computed(() => extractId(url.value))
const invalid = computed(() => url.value.trim().length > 0 && !videoId.value)

/**
 * Thumbnails are public URLs on YouTube's CDN, so nothing needs downloading
 * through us. maxres does not exist for every video - YouTube only generates
 * it above a certain source resolution - which is why the smaller sizes are
 * listed too rather than assumed away.
 */
const sizes = computed(() => {
  if (!videoId.value) return []
  const base = `https://img.youtube.com/vi/${videoId.value}`
  return [
    { key: 'maxres', label: '1280 × 720', url: `${base}/maxresdefault.jpg` },
    { key: 'sd', label: '640 × 480', url: `${base}/sddefault.jpg` },
    { key: 'hq', label: '480 × 360', url: `${base}/hqdefault.jpg` },
    { key: 'mq', label: '320 × 180', url: `${base}/mqdefault.jpg` }
  ]
})
</script>

<template>
  <div class="space-y-4">
    <div>
      <label for="yt-url" class="mb-1 block text-sm font-medium text-stone-900">
        {{ t('youtube.inputLabel') }}
      </label>
      <input
        id="yt-url"
        v-model="url"
        type="url"
        inputmode="url"
        :placeholder="t('youtube.placeholder')"
        class="w-full rounded-lg border px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-ember-200"
        :class="invalid ? 'border-red-400' : 'border-stone-300 focus:border-ember-500'"
      />
      <p v-if="invalid" class="mt-1 text-sm text-red-700" role="alert">
        {{ t('youtube.invalid') }}
      </p>
      <p v-else-if="videoId" class="mt-1 font-mono text-sm text-stone-500">
        {{ t('youtube.videoId') }}: {{ videoId }}
      </p>
    </div>

    <div v-if="sizes.length" class="grid gap-4 sm:grid-cols-2">
      <div
        v-for="size in sizes"
        :key="size.key"
        class="rounded-lg border border-stone-200 bg-white p-3"
      >
        <img
          :src="size.url"
          :alt="t('youtube.thumbAlt', { size: size.label })"
          loading="lazy"
          class="w-full rounded bg-stone-100"
          width="480"
          height="360"
        />
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-stone-700">{{ size.label }}</span>
          <a
            :href="size.url"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            {{ t('youtube.open') }}
          </a>
        </div>
      </div>
    </div>

    <p v-if="videoId" class="text-sm text-stone-500">{{ t('youtube.maxresNote') }}</p>
  </div>
</template>
