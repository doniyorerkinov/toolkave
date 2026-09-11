import {
  LOCALES,
  DEFAULT_LOCALE,
  toolPath,
  categoryPath,
  getCategory,
  type CategoryDef,
  type Locale,
  type ToolDef
} from '~/data/tools'

export const SITE_URL = 'https://toolkave.com'

function absolute(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

/** Open Graph wants a territory, not just a language. */
const OG_LOCALE: Record<Locale, string> = { en: 'en_US', ru: 'ru_RU', uz: 'uz_UZ' }

const homePath = (locale: Locale) => (locale === DEFAULT_LOCALE ? '/' : `/${locale}`)

/** The visible breadcrumb as data, so a result can show "Toolkave › PDF › Merge PDF". */
function breadcrumbs(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(item.path)
    }))
  }
}

interface SeoInput {
  title: string
  description: string
  /** Canonical path for the current locale. */
  path: string
  /** Path per locale, used for hreflang. Only existing pages belong here. */
  alternates: Partial<Record<Locale, string>>
  /** Optional JSON-LD to attach: one block or several. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

/**
 * Sets title, description, canonical, Open Graph and hreflang.
 *
 * hreflang is built from the registry rather than assumed, so a tool that is
 * only published in two locales never advertises a third.
 */
export function usePageSeo(input: SeoInput) {
  const canonical = absolute(input.path)

  type HeadLink = { rel: 'canonical' | 'alternate'; href: string; hreflang?: string }
  const links: HeadLink[] = [{ rel: 'canonical', href: canonical }]

  const alternateLocales = Object.keys(input.alternates) as Locale[]
  if (alternateLocales.length > 1) {
    for (const locale of alternateLocales) {
      const path = input.alternates[locale]
      if (!path) continue
      links.push({ rel: 'alternate', hreflang: locale, href: absolute(path) })
    }
    const fallback = input.alternates[DEFAULT_LOCALE]
    if (fallback) {
      links.push({ rel: 'alternate', hreflang: 'x-default', href: absolute(fallback) })
    }
  }

  useHead({
    title: input.title,
    // unhead types `rel="alternate"` as the RSS/Atom variant, which requires a
    // `type` attribute. hreflang alternates are valid HTML but do not fit that
    // union, so the array is cast at this one boundary. The rendered output is
    // verified against the deployed pages.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    link: links as any,
    script: (Array.isArray(input.jsonLd) ? input.jsonLd : input.jsonLd ? [input.jsonLd] : []).map(block => ({
      type: 'application/ld+json',
      innerHTML: JSON.stringify(block)
    }))
  })

  const { locale, t } = useI18n()
  const current = locale.value as Locale

  useSeoMeta({
    description: input.description,
    ogSiteName: t('site.name'),
    ogLocale: OG_LOCALE[current],
    ogLocaleAlternate: alternateLocales.filter(other => other !== current).map(other => OG_LOCALE[other]),
    ogTitle: input.title,
    ogDescription: input.description,
    ogUrl: canonical,
    ogType: 'website',
    ogImage: `${SITE_URL}/og.png`,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    twitterCard: 'summary_large_image',
    twitterImage: `${SITE_URL}/og.png`,
    twitterTitle: input.title,
    twitterDescription: input.description
  })
}

/** SEO for a tool page, including WebApplication structured data. */
export function useToolSeo(tool: ToolDef, locale: Locale) {
  const { t } = useI18n()

  const path = toolPath(tool, locale)
  if (!path) return

  const alternates: Partial<Record<Locale, string>> = {}
  for (const candidate of LOCALES) {
    const alt = toolPath(tool, candidate)
    if (alt) alternates[candidate] = alt
  }

  const title = t(`tools.${tool.id}.title`)
  const description = t(`tools.${tool.id}.description`)
  const name = t(`tools.${tool.id}.name`)
  const category = getCategory(tool.category)

  usePageSeo({
    title,
    description,
    path,
    alternates,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name,
        description,
        url: absolute(path),
        image: `${SITE_URL}/og.png`,
        inLanguage: locale,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@type': 'Organization', name: t('site.name'), url: `${SITE_URL}/` }
      },
      breadcrumbs([
        { name: t('shell.breadcrumbHome'), path: homePath(locale) },
        ...(category ? [{ name: t(`categories.${category.id}.name`), path: categoryPath(category, locale) }] : []),
        { name, path }
      ])
    ]
  })
}

/** SEO for a category page. */
export function useCategorySeo(category: CategoryDef, locale: Locale) {
  const { t } = useI18n()

  const alternates: Partial<Record<Locale, string>> = {}
  for (const candidate of LOCALES) {
    alternates[candidate] = categoryPath(category, candidate)
  }

  const name = t(`categories.${category.id}.name`)
  const description = t(`categories.${category.id}.description`)
  const path = categoryPath(category, locale)

  usePageSeo({
    // "PDF | Toolkave" says nothing in a result list; the title key carries
    // the query people actually type.
    title: t(`categories.${category.id}.title`),
    description,
    path,
    alternates,
    jsonLd: breadcrumbs([{ name: t('shell.breadcrumbHome'), path: homePath(locale) }, { name, path }])
  })
}
