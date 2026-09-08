<script setup lang="ts">
const { t, locale } = useI18n()

// hreflang is emitted per page by useSeo (registry-driven), so it is not
// duplicated here — only the document language.
useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title}` : t('site.name'))
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
