/**
 * Tool registry — the single source of truth for routing, navigation,
 * sitemap, hreflang, prerendering and related-tool links.
 *
 * Keep this file free of Nuxt/Vue imports: `nuxt.config.ts` imports it at
 * config time to generate the prerender route list.
 *
 * Adding a locale = add it to `LOCALES`, add the slugs, add the messages.
 * No page or component changes.
 */

export const LOCALES = ['en', 'ru', 'uz'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export type CategoryId =
  | 'pdf'
  | 'image'
  | 'color'
  | 'converters'
  | 'calculators'
  | 'generators'
  | 'text'
  | 'dev'

export interface CategoryDef {
  id: CategoryId
  icon: string
  /** URL segment per locale. Some are identical on purpose ("pdf" is searched the same everywhere). */
  slugs: Record<Locale, string>
}

export interface ToolDef {
  id: string
  category: CategoryId
  /** Sub-grouping inside a category page (Organize, Convert, Edit…). */
  group: string
  /** Component key resolved by the dynamic tool page. */
  component: string
  icon: string
  /**
   * Whether this tool is shipped.
   *
   * `false` means it exists in the codebase but gets no URL in production: no
   * route, no sitemap entry, no nav link, no related-tools link, and a direct
   * hit 404s. It stays fully reachable in `nuxt dev` so it can be tested.
   *
   * Flip to `true` only after a human has actually used the tool. Everything
   * that reads the registry fails closed, so forgetting to set it hides the
   * tool rather than shipping something untested.
   */
  published: boolean
  /**
   * Optional preset for entries that share one component.
   *
   * Search treats "JPG to PDF" and "HEIC to PDF" as different queries even
   * though they are one function, so each deserves its own page. That is
   * several registry entries pointing at the same component with a different
   * `config`, not several components.
   */
  config?: Record<string, unknown>
  /**
   * Locales this tool is PUBLISHED in. A tool without written content for a
   * locale gets no URL there — no thin pages, no wasted crawl budget, and
   * hreflang only points at pages that actually exist.
   */
  locales: Locale[]
  slugs: Partial<Record<Locale, string>>
  related: string[]
  /**
   * Locales whose live URL has been handed to Google Search Console.
   *
   * A record of what has been asked for, nothing more: it changes nothing
   * about the site, and whether a tool is live depends on `published`
   * alone. Kept here rather than in a notebook because the alternative is
   * asking Google to index the same page twice and missing three others.
   */
  indexed?: Locale[]
  /** Heavy tools lazy-load their libraries and run in a web worker. */
  heavy?: boolean
  acceptedTypes?: string[]
  maxFiles?: number
}

export const categories: CategoryDef[] = [
  { id: 'pdf', icon: 'file-text', slugs: { en: 'pdf', ru: 'pdf', uz: 'pdf' } },
  { id: 'image', icon: 'image', slugs: { en: 'image', ru: 'izobrazheniya', uz: 'rasm' } },
  { id: 'color', icon: 'palette', slugs: { en: 'color', ru: 'cveta', uz: 'ranglar' } },
  { id: 'converters', icon: 'repeat', slugs: { en: 'converters', ru: 'konvertery', uz: 'konvertorlar' } },
  { id: 'calculators', icon: 'calculator', slugs: { en: 'calculators', ru: 'kalkulyatory', uz: 'kalkulyatorlar' } },
  { id: 'generators', icon: 'sparkles', slugs: { en: 'generators', ru: 'generatory', uz: 'generatorlar' } },
  { id: 'text', icon: 'type', slugs: { en: 'text', ru: 'tekst', uz: 'matn' } },
  { id: 'dev', icon: 'code', slugs: { en: 'dev', ru: 'dev', uz: 'dev' } }
]

export const tools: ToolDef[] = [
  {
    id: 'color-picker',
    category: 'color',
    group: 'pick',
    component: 'color/Picker',
    icon: 'palette',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'color-picker', ru: 'podbor-cveta', uz: 'rang-tanlash' },
    related: ['image-color-picker'],
    maxFiles: 0
  },
  {
    id: 'image-color-picker',
    category: 'color',
    group: 'pick',
    component: 'color/FromImage',
    icon: 'image',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'image-color-picker', ru: 'cvet-s-izobrazheniya', uz: 'rasmdan-rang-olish' },
    related: ['color-picker'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'pdf-merge',
    category: 'pdf',
    group: 'organize',
    component: 'pdf/Merge',
    icon: 'layers',
    // Already live before this flag existed. Not yet human-tested end to end -
    // set to false to pull it until it has been.
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: {
      en: 'merge',
      ru: 'obedinit',
      uz: 'birlashtirish'
    },
    related: ['pdf-split'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 50
  },
  {
    id: 'pdf-split',
    category: 'pdf',
    group: 'organize',
    component: 'pdf/Split',
    icon: 'scissors',
    // Already live before this flag existed. Not yet human-tested end to end.
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: {
      en: 'split',
      ru: 'razdelit',
      uz: 'ajratish'
    },
    related: ['pdf-merge'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-rotate',
    category: 'pdf',
    group: 'organize',
    component: 'pdf/Rotate',
    icon: 'rotate-cw',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'rotate', ru: 'povernut', uz: 'burish' },
    related: ['pdf-merge', 'pdf-split'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-remove-pages',
    category: 'pdf',
    group: 'organize',
    component: 'pdf/RemovePages',
    icon: 'trash',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'remove-pages', ru: 'udalit-stranitsy', uz: 'sahifalarni-ochirish' },
    related: ['pdf-split', 'pdf-merge'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  // Same component, two pages: "JPG to PDF" and "PNG to PDF" are one function
  // but different search queries, so each gets its own page and its own content.
  {
    id: 'jpg-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/ImagesToPdf',
    icon: 'image',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'jpg-to-pdf', ru: 'jpg-v-pdf', uz: 'jpg-dan-pdf' },
    related: ['png-to-pdf', 'image-to-pdf', 'pdf-merge'],
    config: { accept: 'image/jpeg' },
    acceptedTypes: ['image/jpeg'],
    maxFiles: 100
  },
  {
    id: 'png-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/ImagesToPdf',
    icon: 'image',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'png-to-pdf', ru: 'png-v-pdf', uz: 'png-dan-pdf' },
    related: ['jpg-to-pdf', 'image-to-pdf', 'pdf-merge'],
    config: { accept: 'image/png' },
    acceptedTypes: ['image/png'],
    maxFiles: 100
  },
  {
    id: 'pdf-page-numbers',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/PageNumbers',
    icon: 'hash',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'add-page-numbers', ru: 'nomera-stranits', uz: 'sahifa-raqamlari' },
    related: ['pdf-watermark', 'pdf-merge'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-watermark',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/Watermark',
    icon: 'stamp',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'watermark-pdf', ru: 'vodyanoj-znak-pdf', uz: 'pdf-suv-belgisi' },
    related: ['pdf-page-numbers', 'pdf-info'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-info',
    category: 'pdf',
    group: 'other',
    component: 'pdf/Info',
    icon: 'info',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'pdf-info', ru: 'informatsiya-o-pdf', uz: 'pdf-malumotlari' },
    related: ['pdf-split', 'pdf-watermark'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-header-footer',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/HeaderFooter',
    icon: 'panel-top',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'header-footer-pdf', ru: 'kolontituly-pdf', uz: 'pdf-kolontitul' },
    related: ['pdf-page-numbers', 'pdf-watermark'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-resize',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/Resize',
    icon: 'scaling',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'resize-pdf', ru: 'izmenit-format-pdf', uz: 'pdf-formatini-ozgartirish' },
    related: ['pdf-rotate', 'pdf-info'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-flatten',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/Flatten',
    icon: 'layers-2',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'flatten-pdf', ru: 'svesti-pdf', uz: 'pdf-tekislash' },
    related: ['pdf-fill-form', 'pdf-protect'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-fill-form',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/FillForm',
    icon: 'form-input',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'fill-pdf-form', ru: 'zapolnit-formu-pdf', uz: 'pdf-shaklni-toldirish' },
    related: ['pdf-flatten', 'pdf-sign'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-sign',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/Sign',
    icon: 'pen-tool',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'sign-pdf', ru: 'podpisat-pdf', uz: 'pdf-imzolash' },
    related: ['pdf-fill-form', 'pdf-flatten'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-protect',
    category: 'pdf',
    group: 'security',
    component: 'pdf/Protect',
    icon: 'lock',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'protect-pdf', ru: 'zashchitit-pdf', uz: 'pdf-himoyalash' },
    related: ['pdf-unlock', 'pdf-watermark'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-unlock',
    category: 'pdf',
    group: 'security',
    component: 'pdf/Unlock',
    icon: 'unlock',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'unlock-pdf', ru: 'snyat-parol-pdf', uz: 'pdf-parolini-ochirish' },
    related: ['pdf-protect', 'pdf-info'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'currency-converter',
    category: 'converters',
    group: 'money',
    component: 'converters/CurrencyConverter',
    icon: 'coins',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'currency-converter', ru: 'konverter-valyut', uz: 'valyuta-konvertori' },
    related: ['unit-converter', 'percentage-calculator']
  },
  {
    id: 'percentage-calculator',
    category: 'calculators',
    group: 'everyday',
    component: 'calculators/Percentage',
    icon: 'percent',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'percentage-calculator', ru: 'kalkulyator-procentov', uz: 'foiz-kalkulyatori' },
    related: ['loan-calculator']
  },
  {
    id: 'age-calculator',
    category: 'calculators',
    group: 'dates',
    component: 'calculators/AgeCalculator',
    icon: 'calendar',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'age-calculator', ru: 'kalkulyator-vozrasta', uz: 'yosh-kalkulyatori' },
    related: ['timezone-converter']
  },
  {
    id: 'bmi-calculator',
    category: 'calculators',
    group: 'health',
    component: 'calculators/Bmi',
    icon: 'activity',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'bmi-calculator', ru: 'kalkulyator-imt', uz: 'tvi-kalkulyatori' },
    related: ['unit-converter']
  },
  {
    id: 'loan-calculator',
    category: 'calculators',
    group: 'money',
    component: 'calculators/Loan',
    icon: 'banknote',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'loan-calculator', ru: 'kreditnyj-kalkulyator', uz: 'kredit-kalkulyatori' },
    related: ['percentage-calculator']
  },
  {
    id: 'unit-converter',
    category: 'converters',
    group: 'measures',
    component: 'converters/UnitConverter',
    icon: 'ruler',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'unit-converter', ru: 'konverter-velichin', uz: 'birlik-konvertori' },
    related: ['timezone-converter']
  },
  {
    id: 'timezone-converter',
    category: 'converters',
    group: 'time',
    component: 'converters/TimezoneConverter',
    icon: 'clock',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'time-zone-converter', ru: 'konverter-chasovyh-poyasov', uz: 'vaqt-mintaqasi-konvertori' },
    related: ['age-calculator', 'unit-converter']
  },
  {
    id: 'webp-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/ImagesToPdf',
    icon: 'image',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'webp-to-pdf', ru: 'webp-v-pdf', uz: 'webp-dan-pdf' },
    related: ['jpg-to-pdf', 'png-to-pdf'],
    config: { accept: 'image/webp' },
    acceptedTypes: ['image/webp'],
    maxFiles: 100
  },
  {
    id: 'heic-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/ImagesToPdf',
    icon: 'image',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'heic-to-pdf', ru: 'heic-v-pdf', uz: 'heic-dan-pdf' },
    related: ['jpg-to-pdf', 'heic-to-jpg'],
    config: { accept: 'image/heic,image/heif,.heic,.heif' },
    acceptedTypes: ['image/heic'],
    maxFiles: 50
  },
  // The catch-all page: any format, mixed freely. Same component; the wide
  // `accept` is the only difference, and "image to pdf" is its own query.
  {
    id: 'image-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/ImagesToPdf',
    icon: 'image',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'image-to-pdf', ru: 'izobrazhenie-v-pdf', uz: 'rasmdan-pdf' },
    related: ['jpg-to-pdf', 'png-to-pdf', 'scan-to-pdf'],
    config: { accept: 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif' },
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
    maxFiles: 100
  },
  {
    id: 'image-compress',
    category: 'image',
    group: 'optimise',
    component: 'image/Compress',
    icon: 'minimize',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'compress-image', ru: 'szhat-izobrazhenie', uz: 'rasmni-siqish' },
    related: ['image-resize', 'png-to-jpg'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-resize',
    category: 'image',
    group: 'optimise',
    component: 'image/Resize',
    icon: 'scaling',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'resize-image', ru: 'izmenit-razmer', uz: 'rasm-olchamini-ozgartirish' },
    related: ['image-crop', 'image-compress'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  // Same component as Resize, opened straight into the selection. "Crop
  // image" is its own query and deserves its own page, not a mode hidden
  // behind a toggle on another tool.
  {
    id: 'image-crop',
    category: 'image',
    group: 'optimise',
    component: 'image/Resize',
    icon: 'scissors',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'crop-image', ru: 'obrezat-izobrazhenie', uz: 'rasmni-qirqish' },
    config: { cropOnly: true },
    related: ['image-resize', 'image-compress'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-rotate',
    category: 'image',
    group: 'optimise',
    component: 'image/Rotate',
    icon: 'rotate-cw',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'rotate-image', ru: 'povernut-izobrazhenie', uz: 'rasmni-burish' },
    related: ['image-crop', 'image-resize'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-metadata',
    category: 'image',
    group: 'optimise',
    component: 'image/Metadata',
    icon: 'map-pin-off',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'remove-exif-data', ru: 'udalit-exif', uz: 'exif-ochirish' },
    related: ['image-compress', 'image-resize'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-redact',
    category: 'image',
    group: 'optimise',
    component: 'image/Redact',
    icon: 'eye-off',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'blur-image', ru: 'razmyt-izobrazhenie', uz: 'rasmni-xiralashtirish' },
    related: ['image-metadata', 'image-crop'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-cutout',
    category: 'image',
    group: 'optimise',
    component: 'image/Cutout',
    icon: 'sparkles',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'remove-background', ru: 'udalit-fon', uz: 'fonni-olib-tashlash' },
    related: ['image-passport', 'image-crop', 'image-compress'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-passport',
    category: 'image',
    group: 'optimise',
    component: 'image/Passport',
    icon: 'user-round',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'passport-photo', ru: 'foto-na-dokumenty', uz: 'hujjatga-surat' },
    related: ['image-crop', 'image-compress'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-social',
    category: 'image',
    group: 'optimise',
    component: 'image/Social',
    icon: 'smartphone',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'social-media-image-size', ru: 'razmer-kartinki-dlya-socsetey', uz: 'ijtimoiy-tarmoq-rasm-olchami' },
    related: ['image-crop', 'image-resize', 'image-compress'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-favicon',
    category: 'image',
    group: 'optimise',
    component: 'image/Favicon',
    icon: 'badge-check',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'favicon-generator', ru: 'generator-favikonok', uz: 'favikon-generatori' },
    related: ['image-resize', 'image-social'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxFiles: 1
  },
  {
    id: 'svg-to-png',
    category: 'image',
    group: 'convert',
    component: 'image/SvgToPng',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'svg-to-png', ru: 'svg-v-png', uz: 'svg-dan-png' },
    related: ['image-favicon', 'png-to-jpg'],
    acceptedTypes: ['image/svg+xml'],
    maxFiles: 1
  },
  {
    id: 'image-watermark',
    category: 'image',
    group: 'optimise',
    component: 'image/Watermark',
    icon: 'stamp',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'add-watermark', ru: 'vodyanoy-znak', uz: 'suv-belgisi' },
    related: ['image-metadata', 'image-compress'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-join',
    category: 'image',
    group: 'optimise',
    component: 'image/Join',
    icon: 'layers-2',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'combine-images', ru: 'obedinit-izobrazheniya', uz: 'rasmlarni-birlashtirish' },
    related: ['image-split', 'image-to-pdf'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 20
  },
  {
    id: 'image-split',
    category: 'image',
    group: 'optimise',
    component: 'image/Split',
    icon: 'table',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'split-image', ru: 'razrezat-izobrazhenie', uz: 'rasmni-bolish' },
    related: ['image-join', 'image-crop'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  {
    id: 'image-filters',
    category: 'image',
    group: 'optimise',
    component: 'image/Filters',
    icon: 'contrast',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'black-and-white-photo', ru: 'cherno-beloe-foto', uz: 'oq-qora-surat' },
    related: ['image-compress', 'image-to-pdf'],
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    maxFiles: 1
  },
  // One component, one page per conversion pair - each is a separate query.
  {
    id: 'png-to-jpg',
    category: 'image',
    group: 'convert',
    component: 'image/Convert',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'png-to-jpg', ru: 'png-v-jpg', uz: 'png-dan-jpg' },
    related: ['jpg-to-png', 'image-compress'],
    acceptedTypes: ['image/png'],
    config: { accept: 'image/png', to: 'jpeg' },
    maxFiles: 1
  },
  {
    id: 'jpg-to-png',
    category: 'image',
    group: 'convert',
    component: 'image/Convert',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'jpg-to-png', ru: 'jpg-v-png', uz: 'jpg-dan-png' },
    related: ['png-to-jpg', 'image-compress'],
    acceptedTypes: ['image/jpeg'],
    config: { accept: 'image/jpeg', to: 'png' },
    maxFiles: 1
  },
  {
    id: 'jpg-to-webp',
    category: 'image',
    group: 'convert',
    component: 'image/Convert',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'jpg-to-webp', ru: 'jpg-v-webp', uz: 'jpg-dan-webp' },
    config: { accept: 'image/jpeg', to: 'webp' },
    related: ['png-to-webp', 'image-compress'],
    acceptedTypes: ['image/jpeg'],
    maxFiles: 1
  },
  {
    id: 'png-to-webp',
    category: 'image',
    group: 'convert',
    component: 'image/Convert',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'png-to-webp', ru: 'png-v-webp', uz: 'png-dan-webp' },
    config: { accept: 'image/png', to: 'webp' },
    related: ['jpg-to-webp', 'image-compress'],
    acceptedTypes: ['image/png'],
    maxFiles: 1
  },
  {
    id: 'webp-to-jpg',
    category: 'image',
    group: 'convert',
    component: 'image/Convert',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'webp-to-jpg', ru: 'webp-v-jpg', uz: 'webp-dan-jpg' },
    related: ['png-to-jpg', 'image-compress'],
    acceptedTypes: ['image/webp'],
    config: { accept: 'image/webp', to: 'jpeg' },
    maxFiles: 1
  },
  {
    id: 'heic-to-jpg',
    category: 'image',
    group: 'convert',
    component: 'image/Convert',
    icon: 'repeat',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'heic-to-jpg', ru: 'heic-v-jpg', uz: 'heic-dan-jpg' },
    related: ['heic-to-pdf', 'image-compress'],
    acceptedTypes: ['image/heic'],
    config: { accept: 'image/heic,image/heif,.heic,.heif', to: 'jpeg' },
    maxFiles: 1
  },
  {
    id: 'qr-generator',
    category: 'generators',
    group: 'codes',
    component: 'generators/QrGenerator',
    icon: 'qr-code',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'qr-code-generator', ru: 'generator-qr-koda', uz: 'qr-kod-generatori' },
    related: ['password-generator']
  },
  {
    id: 'youtube-thumbnail',
    category: 'generators',
    group: 'media',
    component: 'generators/YoutubeThumbnail',
    icon: 'youtube',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: {
      en: 'youtube-thumbnail-downloader',
      ru: 'skachat-oblozhku-youtube',
      uz: 'youtube-muqova-yuklash'
    },
    related: ['qr-generator']
  },
  {
    id: 'password-generator',
    category: 'generators',
    group: 'security',
    component: 'generators/PasswordGenerator',
    icon: 'key',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'password-generator', ru: 'generator-parolej', uz: 'parol-generatori' },
    related: []
  },
  {
    id: 'json-validator',
    category: 'dev',
    group: 'json',
    component: 'dev/JsonValidator',
    icon: 'badge-check',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'json-validator', ru: 'proverka-json', uz: 'json-tekshirish' },
    related: ['json-diff', 'json-formatter'],
    maxFiles: 0
  },
  {
    id: 'json-diff',
    category: 'dev',
    group: 'json',
    component: 'dev/JsonDiff',
    icon: 'git-compare',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'json-diff', ru: 'sravnit-json', uz: 'json-taqqoslash' },
    related: ['json-validator', 'json-formatter'],
    maxFiles: 0
  },
  {
    id: 'base64',
    category: 'dev',
    group: 'encoding',
    component: 'dev/Base64',
    icon: 'binary',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'base64', ru: 'base64', uz: 'base64' },
    related: ['json-formatter']
  },
  {
    id: 'json-formatter',
    category: 'dev',
    group: 'formatting',
    component: 'dev/JsonFormatter',
    icon: 'braces',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'json-formatter', ru: 'json-formatter', uz: 'json-formatter' },
    related: ['base64']
  },
  {
    id: 'word-counter',
    category: 'text',
    group: 'analyze',
    component: 'text/WordCounter',
    icon: 'type',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: {
      en: 'word-counter',
      ru: 'schetchik-slov',
      uz: 'soz-hisoblagich'
    },
    related: ['docx-word-count']
  },

  /* ---------------------------------------------------------------- */
  /* Wave 3 — tier 3                                                   */
  /* ---------------------------------------------------------------- */

  // The Russian slug is the word people actually search for. "Кракозябры" is
  // the everyday name for mojibake and has no English equivalent worth
  // translating; a literal rendering of "fix broken text" would rank for
  // nothing.
  {
    id: 'fix-encoding',
    category: 'text',
    group: 'repair',
    component: 'text/FixEncoding',
    icon: 'wrench',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: {
      en: 'fix-broken-text',
      ru: 'ispravit-krakozyabry',
      uz: 'buzilgan-matnni-tuzatish'
    },
    related: ['word-counter', 'csv-to-json'],
    acceptedTypes: ['text/plain']
  },
  {
    id: 'docx-word-count',
    category: 'text',
    group: 'analyze',
    component: 'text/WordCounter',
    icon: 'file-text',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: {
      en: 'word-count-docx',
      ru: 'schetchik-slov-word',
      uz: 'word-soz-hisoblagich'
    },
    related: ['word-counter', 'docx-to-text'],
    config: { documents: true }
  },

  // One component, three pages — plain text, HTML and Markdown are three
  // different queries for the same conversion.
  {
    id: 'docx-to-text',
    category: 'converters',
    group: 'documents',
    component: 'converters/DocxConvert',
    icon: 'file-text',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'docx-to-text', ru: 'docx-v-tekst', uz: 'docx-dan-matn' },
    related: ['docx-to-html', 'docx-to-pdf'],
    config: { to: 'text' },
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxFiles: 1
  },
  {
    id: 'docx-to-html',
    category: 'converters',
    group: 'documents',
    component: 'converters/DocxConvert',
    icon: 'code',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'docx-to-html', ru: 'docx-v-html', uz: 'docx-dan-html' },
    related: ['docx-to-markdown', 'docx-to-text'],
    config: { to: 'html' },
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxFiles: 1
  },
  {
    id: 'docx-to-markdown',
    category: 'converters',
    group: 'documents',
    component: 'converters/DocxConvert',
    icon: 'hash',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'docx-to-markdown', ru: 'docx-v-markdown', uz: 'docx-dan-markdown' },
    related: ['docx-to-html', 'markdown-to-html'],
    config: { to: 'markdown' },
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxFiles: 1
  },
  {
    id: 'markdown-to-html',
    category: 'converters',
    group: 'markup',
    component: 'converters/MarkdownConvert',
    icon: 'code',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'markdown-to-html', ru: 'markdown-v-html', uz: 'markdown-dan-html' },
    related: ['html-to-markdown', 'docx-to-markdown'],
    config: { from: 'markdown' }
  },
  {
    id: 'html-to-markdown',
    category: 'converters',
    group: 'markup',
    component: 'converters/MarkdownConvert',
    icon: 'hash',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'html-to-markdown', ru: 'html-v-markdown', uz: 'html-dan-markdown' },
    related: ['markdown-to-html', 'docx-to-markdown'],
    config: { from: 'html' }
  },

  // "Word to PDF" is the query, not "DOCX to PDF" — the slug follows the
  // search, the tool id follows the format.
  {
    id: 'docx-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/DocxToPdf',
    icon: 'file-type',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'word-to-pdf', ru: 'word-v-pdf', uz: 'word-dan-pdf' },
    related: ['docx-to-text', 'pdf-merge'],
    heavy: true,
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxFiles: 1
  },

  // Six pages over the CSV / JSON / Excel triangle, one component.
  {
    id: 'csv-to-json',
    category: 'converters',
    group: 'data',
    component: 'converters/TableConvert',
    icon: 'braces',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'csv-to-json', ru: 'csv-v-json', uz: 'csv-dan-json' },
    related: ['json-to-csv', 'csv-to-excel'],
    acceptedTypes: ['text/csv'],
    config: { from: 'csv', to: 'json' },
    maxFiles: 1
  },
  {
    id: 'json-to-csv',
    category: 'converters',
    group: 'data',
    component: 'converters/TableConvert',
    icon: 'table',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'json-to-csv', ru: 'json-v-csv', uz: 'json-dan-csv' },
    related: ['csv-to-json', 'json-to-excel'],
    config: { from: 'json', to: 'csv' },
    maxFiles: 1
  },
  {
    id: 'csv-to-excel',
    category: 'converters',
    group: 'data',
    component: 'converters/TableConvert',
    icon: 'table',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'csv-to-excel', ru: 'csv-v-excel', uz: 'csv-dan-excel' },
    related: ['excel-to-csv', 'csv-to-json'],
    acceptedTypes: ['text/csv'],
    config: { from: 'csv', to: 'xlsx' },
    maxFiles: 1
  },
  {
    id: 'excel-to-csv',
    category: 'converters',
    group: 'data',
    component: 'converters/TableConvert',
    icon: 'table',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'excel-to-csv', ru: 'excel-v-csv', uz: 'excel-dan-csv' },
    related: ['csv-to-excel', 'excel-to-json'],
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    config: { from: 'xlsx', to: 'csv' },
    maxFiles: 1
  },
  {
    id: 'excel-to-json',
    category: 'converters',
    group: 'data',
    component: 'converters/TableConvert',
    icon: 'braces',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'excel-to-json', ru: 'excel-v-json', uz: 'excel-dan-json' },
    related: ['json-to-excel', 'excel-to-csv'],
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    config: { from: 'xlsx', to: 'json' },
    maxFiles: 1
  },
  {
    id: 'json-to-excel',
    category: 'converters',
    group: 'data',
    component: 'converters/TableConvert',
    icon: 'table',
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'json-to-excel', ru: 'json-v-excel', uz: 'json-dan-excel' },
    related: ['excel-to-json', 'json-to-csv'],
    config: { from: 'json', to: 'xlsx' },
    maxFiles: 1
  },

  {
    id: 'csv-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/TableToPdf',
    icon: 'table',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'csv-to-pdf', ru: 'csv-v-pdf', uz: 'csv-dan-pdf' },
    related: ['excel-to-pdf', 'csv-to-excel'],
    acceptedTypes: ['text/csv'],
    config: { from: 'csv' },
    maxFiles: 1
  },
  {
    id: 'excel-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/TableToPdf',
    icon: 'table',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'excel-to-pdf', ru: 'excel-v-pdf', uz: 'excel-dan-pdf' },
    related: ['csv-to-pdf', 'excel-to-csv'],
    acceptedTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    config: { from: 'xlsx' },
    maxFiles: 1
  },
  {
    id: 'pdf-grayscale',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/Grayscale',
    icon: 'contrast',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'grayscale-pdf', ru: 'pdf-v-chernobelyj', uz: 'pdf-oq-qora' },
    related: ['pdf-watermark', 'pdf-info'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-compress',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/Compress',
    icon: 'file-down',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'compress-pdf', ru: 'szhat-pdf', uz: 'pdf-siqish' },
    related: ['pdf-merge', 'pdf-info'],
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-compare',
    category: 'pdf',
    group: 'other',
    component: 'pdf/ComparePdf',
    icon: 'git-compare',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'compare-pdf', ru: 'sravnit-pdf', uz: 'pdf-taqqoslash' },
    related: ['pdf-info'],
    heavy: true,
    acceptedTypes: ['application/pdf'],
    maxFiles: 2
  },
  {
    id: 'pdf-annotate',
    category: 'pdf',
    group: 'edit',
    component: 'pdf/AnnotatePdf',
    icon: 'highlighter',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'annotate-pdf', ru: 'pometki-v-pdf', uz: 'pdf-belgilash' },
    related: ['pdf-redact', 'pdf-sign'],
    heavy: true,
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-redact',
    category: 'pdf',
    group: 'security',
    component: 'pdf/RedactPdf',
    icon: 'eye-off',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'redact-pdf', ru: 'skryt-dannye-pdf', uz: 'pdf-malumotlarini-yashirish' },
    related: ['pdf-protect', 'pdf-annotate'],
    heavy: true,
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-to-jpg',
    category: 'pdf',
    group: 'convert-from',
    component: 'pdf/PdfToJpg',
    icon: 'image',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'pdf-to-jpg', ru: 'pdf-v-jpg', uz: 'pdf-dan-jpg' },
    related: ['jpg-to-pdf', 'pdf-split'],
    heavy: true,
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'pdf-to-text',
    category: 'pdf',
    group: 'convert-from',
    component: 'pdf/PdfToText',
    icon: 'file-text',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'pdf-to-text', ru: 'pdf-v-tekst', uz: 'pdf-dan-matn' },
    related: ['word-counter', 'docx-to-text'],
    heavy: true,
    acceptedTypes: ['application/pdf'],
    maxFiles: 1
  },
  {
    id: 'scan-to-pdf',
    category: 'pdf',
    group: 'convert-to',
    component: 'pdf/ScanToPdf',
    icon: 'scan',
    published: true,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'scan-to-pdf', ru: 'foto-dokumenta-v-pdf', uz: 'hujjat-rasmini-pdf' },
    related: ['jpg-to-pdf', 'scan-to-pdf'],
    heavy: true,
    acceptedTypes: ['image/jpeg', 'image/png', 'image/heic'],
    maxFiles: 50
  }
]

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every lookup takes `includeDrafts`, defaulting to `false` so production
 * behaviour is the safe one. Callers in the app pass `import.meta.dev`, which
 * makes unpublished tools reachable while developing and invisible once built.
 */
function visible(tool: ToolDef, includeDrafts: boolean): boolean {
  return tool.published || includeDrafts
}

export function getCategory(id: CategoryId): CategoryDef | undefined {
  return categories.find(c => c.id === id)
}

export function categoryBySlug(slug: string, locale: Locale): CategoryDef | undefined {
  return categories.find(c => c.slugs[locale] === slug)
}

export function toolBySlug(
  categorySlug: string,
  toolSlug: string,
  locale: Locale,
  includeDrafts = false
): ToolDef | undefined {
  const category = categoryBySlug(categorySlug, locale)
  if (!category) return undefined
  return tools.find(
    t =>
      t.category === category.id &&
      t.locales.includes(locale) &&
      t.slugs[locale] === toolSlug &&
      visible(t, includeDrafts)
  )
}

export function toolsInCategory(
  id: CategoryId,
  locale: Locale,
  includeDrafts = false
): ToolDef[] {
  return tools.filter(
    t => t.category === id && t.locales.includes(locale) && visible(t, includeDrafts)
  )
}

/** Categories that have at least one visible tool in this locale. */
export function categoriesWithTools(locale: Locale, includeDrafts = false): CategoryDef[] {
  return categories.filter(c => toolsInCategory(c.id, locale, includeDrafts).length > 0)
}

/** Published tools only — what the site actually ships. */
export function publishedTools(): ToolDef[] {
  return tools.filter(t => t.published)
}

/* ------------------------------------------------------------------ */
/* Path building                                                       */
/* ------------------------------------------------------------------ */

/** Locale prefix, honouring `prefix_except_default`. */
function prefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`
}

export function categoryPath(category: CategoryDef, locale: Locale): string {
  return `${prefix(locale)}/${category.slugs[locale]}`
}

export function toolPath(tool: ToolDef, locale: Locale): string | undefined {
  if (!tool.locales.includes(locale)) return undefined
  const category = getCategory(tool.category)
  const slug = tool.slugs[locale]
  if (!category || !slug) return undefined
  return `${prefix(locale)}/${category.slugs[locale]}/${slug}`
}

/**
 * Every route that should be prerendered as a static asset.
 * Static asset requests on Cloudflare Workers are free and unlimited, so
 * everything listed here costs nothing to serve.
 */
export function prerenderRoutes(): string[] {
  const routes = new Set<string>()

  for (const locale of LOCALES) {
    routes.add(prefix(locale) || '/')

    // The prose pages are plain routes rather than registry entries, so they
    // have to be named here or they would never be prerendered.
    for (const page of ['about', 'privacy', 'terms', 'contact']) {
      routes.add(`${prefix(locale)}/${page}`)
    }

    for (const category of categoriesWithTools(locale)) {
      routes.add(categoryPath(category, locale))
    }

    // Drafts are never prerendered, so an unpublished tool has no static page
    // and no chance of being crawled or indexed.
    for (const tool of publishedTools()) {
      const path = toolPath(tool, locale)
      if (path) routes.add(path)
    }
  }

  return [...routes]
}
