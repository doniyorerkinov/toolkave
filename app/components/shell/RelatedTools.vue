<script setup lang="ts">
import type { ToolDef } from '~/data/tools'

defineProps<{ tools: ToolDef[] }>()
const { t } = useI18n()
</script>

<template>
  <section>
    <h2 class="text-xl font-semibold tracking-tight text-stone-900">{{ t('shell.related') }}</h2>
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <ShellToolCard v-for="tool in tools" :key="tool.id" :tool="tool" />
    </div>
  </section>
</template>
