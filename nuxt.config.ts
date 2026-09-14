import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { LOCALES, DEFAULT_LOCALE, prerenderRoutes } from './app/data/tools'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  modules: ['@nuxtjs/i18n', '@pinia/nuxt'],

  hooks: {
    /**
     * Keep the indexing workbench out of the shipped site.
     *
     * The page refuses to render outside dev on its own, but a route that
     * does not exist cannot be found by a crawler, cannot appear in a build
     * manifest, and cannot be forgotten about.
     */
    'pages:extend'(pages) {
      if (process.env.NODE_ENV === 'development') return
      for (let i = pages.length - 1; i >= 0; i--) {
        if (/^\/(?:[a-z]{2}\/)?indexing$/.test(pages[i]!.path)) pages.splice(i, 1)
      }
    }
  },

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
    // pdf.js needs these two data directories at runtime and they are not
    // bundled: the standard-font glyph programs and the CJK character maps.
    // Serving them from node_modules keeps them in step with the installed
    // version instead of drifting as a copy in `public/`.
    publicAssets: [
      {
        baseURL: 'pdfjs/standard_fonts',
        dir: fileURLToPath(new URL('node_modules/pdfjs-dist/standard_fonts', import.meta.url)),
        maxAge: 60 * 60 * 24 * 365
      },
      {
        baseURL: 'pdfjs/cmaps',
        dir: fileURLToPath(new URL('node_modules/pdfjs-dist/cmaps', import.meta.url)),
        maxAge: 60 * 60 * 24 * 365
      }
    ],
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
    plugins: [tailwindcss()],
    optimizeDeps: {
      // libheif is imported only when a HEIC file turns up, so Vite discovers
      // it mid-session, re-optimises, and the page that asked for it is left
      // holding a stale URL that answers 504. Naming it here has it
      // pre-bundled at startup instead.
      include: ['libheif-js/libheif-wasm/libheif-bundle.mjs', '@pdf-lib/upng', 'onnxruntime-web/wasm']
    }
  },

  // Surfaced to the app so the registry's locale list stays the single source.
  runtimeConfig: {
    public: {
      locales: LOCALES as unknown as string[]
    }
  }
})
