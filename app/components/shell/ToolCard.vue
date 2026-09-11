<script setup lang="ts">
import { toolPath, type Locale, type ToolDef } from '~/data/tools'
import { TONES } from '~/utils/tone'

const props = defineProps<{ tool: ToolDef }>()

const { t, locale } = useI18n()
const href = computed(() => toolPath(props.tool, locale.value as Locale) ?? '/')
const tone = computed(() => TONES[props.tool.category])

/** Dev only: green = published, red = still a draft waiting for its human pass. */
const showStatus = import.meta.dev
</script>

<template>
  <NuxtLink
    :to="href"
    class="group flex gap-3.5 rounded-xl border border-stone-200 bg-white p-4 transition hover:-translate-y-px hover:border-stone-300 hover:shadow-md"
  >
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-lg transition"
      :class="[tone.tile, tone.tileHover]"
    >
      <ShellIcon :name="tool.icon" :size="20" />
    </span>
    <span class="min-w-0">
      <h3 class="flex items-center gap-2 font-semibold text-stone-900">
        <span
          v-if="showStatus"
          class="inline-block size-2 shrink-0 rounded-full"
          :class="tool.published ? 'bg-emerald-500' : 'bg-red-500'"
          :title="tool.published ? t('draft.live') : t('draft.badge')"
        />
        {{ t(`tools.${tool.id}.name`) }}
      </h3>
      <p class="mt-0.5 line-clamp-2 text-sm leading-relaxed text-stone-600">
        {{ t(`tools.${tool.id}.short`) }}
      </p>
    </span>
  </NuxtLink>
</template>
