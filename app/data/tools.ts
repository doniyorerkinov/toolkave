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
    id: 'word-counter',
    category: 'text',
    group: 'analyze',
    component: 'text/WordCounter',
    icon: 'type',
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

export function getCategory(id: CategoryId): CategoryDef | undefined {
  return categories.find(c => c.id === id)
}

export function categoryBySlug(slug: string, locale: Locale): CategoryDef | undefined {
  return categories.find(c => c.slugs[locale] === slug)
}

export function toolBySlug(
  categorySlug: string,
  toolSlug: string,
  locale: Locale
): ToolDef | undefined {
  const category = categoryBySlug(categorySlug, locale)
  if (!category) return undefined
  return tools.find(
    t => t.category === category.id && t.locales.includes(locale) && t.slugs[locale] === toolSlug
  )
}

export function toolsInCategory(id: CategoryId, locale: Locale): ToolDef[] {
  return tools.filter(t => t.category === id && t.locales.includes(locale))
}

/** Categories that have at least one published tool in this locale. */
export function categoriesWithTools(locale: Locale): CategoryDef[] {
  return categories.filter(c => toolsInCategory(c.id, locale).length > 0)
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

    for (const tool of tools) {
      const path = toolPath(tool, locale)
      if (path) routes.add(path)
    }
  }

  return [...routes]
}
