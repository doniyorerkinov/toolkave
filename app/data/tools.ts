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
  /** Heavy tools lazy-load their libraries and run in a web worker. */
  heavy?: boolean
  acceptedTypes?: string[]
  maxFiles?: number
}

export const categories: CategoryDef[] = [
  { id: 'pdf', icon: 'file-text', slugs: { en: 'pdf', ru: 'pdf', uz: 'pdf' } },
  { id: 'image', icon: 'image', slugs: { en: 'image', ru: 'izobrazheniya', uz: 'rasm' } },
  { id: 'converters', icon: 'repeat', slugs: { en: 'converters', ru: 'konvertery', uz: 'konvertorlar' } },
  { id: 'calculators', icon: 'calculator', slugs: { en: 'calculators', ru: 'kalkulyatory', uz: 'kalkulyatorlar' } },
  { id: 'generators', icon: 'sparkles', slugs: { en: 'generators', ru: 'generatory', uz: 'generatorlar' } },
  { id: 'text', icon: 'type', slugs: { en: 'text', ru: 'tekst', uz: 'matn' } },
  { id: 'dev', icon: 'code', slugs: { en: 'dev', ru: 'dev', uz: 'dev' } }
]

export const tools: ToolDef[] = [
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
    published: false,
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
    published: false,
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
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'jpg-to-pdf', ru: 'jpg-v-pdf', uz: 'jpg-dan-pdf' },
    related: ['png-to-pdf', 'pdf-merge'],
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
    published: false,
    locales: ['en', 'ru', 'uz'],
    slugs: { en: 'png-to-pdf', ru: 'png-v-pdf', uz: 'png-dan-pdf' },
    related: ['jpg-to-pdf', 'pdf-merge'],
    config: { accept: 'image/png' },
    acceptedTypes: ['image/png'],
    maxFiles: 100
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
    related: []
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
