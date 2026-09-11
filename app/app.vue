<script setup lang="ts">
const { t, locale } = useI18n()

// hreflang is emitted per page by useSeo (registry-driven), so it is not
// duplicated here — only the document language.
useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title}` : t('site.name')),
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
  ],
  meta: [{ name: 'theme-color', content: '#0c0a09' }]
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
