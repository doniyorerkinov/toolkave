<script setup lang="ts">
const { t, locale } = useI18n()

// hreflang is emitted per page by useSeo (registry-driven), so it is not
// duplicated here — only the document language.
/**
 * The heading is the largest paint on every page. Preloading its subset
 * means the first paint is already Manrope, instead of a fallback face that
 * gets swapped (and reflows) once the font arrives. Only the subsets a locale
 * actually uses: Latin everywhere, Cyrillic on Russian pages.
 */
const FONT_SUBSETS = [
  { href: '/fonts/manrope-latin.woff2', locales: ['en', 'ru', 'uz'] },
  { href: '/fonts/manrope-cyrillic.woff2', locales: ['ru'] }
]

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title}` : t('site.name')),
  link: computed(() => [
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ...FONT_SUBSETS.filter(subset => subset.locales.includes(locale.value)).map(subset => ({
      rel: 'preload' as const,
      as: 'font' as const,
      type: 'font/woff2',
      crossorigin: 'anonymous' as const,
      href: subset.href
    }))
  ]),
  meta: [
    { name: 'theme-color', content: '#0c0a09' },
    /*
     * Yandex Webmaster ownership. Their HTML-file method cannot work on this
     * host: Cloudflare's asset handler answers `/file.html` with a 307 to
     * `/file`, and the check wants a 200 at the exact URL. Google's is a DNS
     * record and needs nothing here.
     */
    { name: 'yandex-verification', content: '14d8124bb4c21188' }
  ]
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
