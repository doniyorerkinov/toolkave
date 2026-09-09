import tailwindcss from '@tailwindcss/vite'
import { LOCALES, DEFAULT_LOCALE, prerenderRoutes } from './app/data/tools'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  modules: ['@nuxtjs/i18n', '@pinia/nuxt'],

  i18n: {
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'ru', language: 'ru', name: 'Русский', file: 'ru.json' },
      { code: 'uz', language: 'uz', name: "O'zbekcha", file: 'uz.json' }
    ],
    defaultLocale: DEFAULT_LOCALE,
    // Required for the module's SEO helpers; without it `useSetI18nParams`
    // silently falls back to the current route's params, so switching language
    // on a translated slug produces a broken URL.
    baseUrl: 'https://toolkave.com',
    // English lives at the apex; other locales are prefixed.
    strategy: 'prefix_except_default',
    detectBrowserLanguage: false
  },

  nitro: {
    preset: 'cloudflare_module',
    prerender: {
      // Routes come from the registry, so every published tool/locale pair is
      // emitted as a static asset. Static assets on Workers are free and
      // unlimited; only unlisted routes fall through to the Worker.
      routes: [...prerenderRoutes(), '/sitemap.xml'],
      crawlLinks: true,
      failOnError: false
    }
  },

  vite: {
    plugins: [tailwindcss()]
  },

  // Surfaced to the app so the registry's locale list stays the single source.
  runtimeConfig: {
    public: {
      locales: LOCALES as unknown as string[]
    }
  }
})
