<script setup lang="ts">
const { t, locale } = useI18n()
const { cfBeaconToken } = useRuntimeConfig().public

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
  /*
   * The theme, applied before the first pixel is drawn.
   *
   * Every page here is prerendered to the same HTML for everybody, so the
   * server cannot know which theme this visitor chose. Anything that waits for
   * Vue to hydrate would paint the default first and correct it a moment
   * later, which is the white flash that makes a dark site unpleasant to open.
   * A blocking inline script in the head is the one thing that runs early
   * enough.
   *
   * It only reads: a missing or unreadable value leaves the attribute off and
   * the media query in `main.css` follows the system, which is the right
   * answer for everyone who has never touched the switch. The key is repeated
   * from `useTheme.ts` because this runs long before any module is loaded.
   */
  script: [
    {
      tagPosition: 'head',
      innerHTML:
        "try{var t=localStorage.getItem('toolkave-theme');" +
        "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}"
    },
    /*
     * Visitor counting, cookieless. Cloudflare's beacon sets nothing on the
     * device, so there is no consent banner to show and nothing that
     * contradicts the promise the site makes. Deferred, so it never sits in
     * front of the first paint. Absent entirely until a token is configured.
     */
    ...(cfBeaconToken
      ? [{ defer: true, src: 'https://static.cloudflareinsights.com/beacon.min.js',
           'data-cf-beacon': JSON.stringify({ token: cfBeaconToken }) }]
      : [])
  ],
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
