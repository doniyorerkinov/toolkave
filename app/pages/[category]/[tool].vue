<script setup lang="ts">
import type { Component } from 'vue'
import { toolBySlug, type Locale } from '~/data/tools'

const route = useRoute()
const { locale } = useI18n()

const currentLocale = computed(() => locale.value as Locale)

const categorySlug = computed(() => String(route.params.category ?? ''))
const toolSlug = computed(() => String(route.params.tool ?? ''))

// Drafts resolve in dev so they can be tested, and 404 in production.
const tool = computed(() =>
  toolBySlug(categorySlug.value, toolSlug.value, currentLocale.value, import.meta.dev)
)

if (!tool.value) {
  throw createError({ statusCode: 404, statusMessage: 'Tool not found', fatal: true })
}

useToolSeo(tool.value, currentLocale.value)

/**
 * Tool components are resolved from the registry's `component` field via a
 * glob of dynamic imports. Nuxt's component auto-import is a build-time
 * template transform, so a runtime-computed name cannot be resolved with
 * `resolveComponent` - it renders as an unknown element.
 *
 * Each entry here is a separate chunk, so a page only ever downloads the one
 * tool it shows. That is what keeps pdf.js off the word counter.
 */
const toolModules = import.meta.glob('../../components/tools/**/*.vue')

const toolComponent = computed(() => {
  const loader = toolModules[`../../components/tools/${tool.value!.component}.vue`]
  if (!loader) return null
  return defineAsyncComponent(loader as () => Promise<Component>)
})

if (!toolComponent.value) {
  throw createError({
    statusCode: 500,
    statusMessage: `Tool component missing: ${tool.value.component}`,
    fatal: true
  })
}
</script>

<template>
  <ShellToolShell v-if="tool" :tool="tool">
    <!-- `config` becomes props, so several registry entries can share one
         component with different presets (JPG to PDF vs PNG to PDF). -->
    <component :is="toolComponent" v-if="toolComponent" v-bind="tool.config" />
  </ShellToolShell>
</template>
