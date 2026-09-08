<script setup lang="ts">
import { toolPath, type Locale, type ToolDef } from '~/data/tools'

const props = defineProps<{ tool: ToolDef }>()

const { t, locale } = useI18n()
const href = computed(() => toolPath(props.tool, locale.value as Locale) ?? '/')
</script>

<template>
  <NuxtLink
    :to="href"
    class="group block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm"
  >
    <h3 class="font-medium text-slate-900 group-hover:text-sky-800">
      {{ t(`tools.${tool.id}.name`) }}
    </h3>
    <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ t(`tools.${tool.id}.short`) }}</p>
  </NuxtLink>
</template>
