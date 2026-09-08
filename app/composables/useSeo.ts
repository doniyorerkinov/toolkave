import {
  LOCALES,
  DEFAULT_LOCALE,
  toolPath,
  categoryPath,
  type CategoryDef,
  type Locale,
  type ToolDef
} from '~/data/tools'

const SITE_URL = 'https://toolkave.com'

function absolute(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

interface SeoInput {
  title: string
  description: string
  /** Canonical path for the current locale. */
  path: string
  /** Path per locale, used for hreflang. Only existing pages belong here. */
  alternates: Partial<Record<Locale, string>>
  /** Optional JSON-LD to attach. */
  jsonLd?: Record<string, unknown>
}

/**
 * Sets title, description, canonical, Open Graph and hreflang.
 *
 * hreflang is built from the registry rather than assumed, so a tool that is
 * only published in two locales never advertises a third.
 */
export function usePageSeo(input: SeoInput) {
  const canonical = absolute(input.path)

  const links: Record<string, string>[] = [{ rel: 'canonical', href: canonical }]

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
    link: links,
    script: input.jsonLd
      ? [{ type: 'application/ld+json', innerHTML: JSON.stringify(input.jsonLd) }]
      : []
  })

  useSeoMeta({
    description: input.description,
    ogTitle: input.title,
    ogDescription: input.description,
    ogUrl: canonical,
    ogType: 'website',
    twitterCard: 'summary_large_image',
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

  usePageSeo({
    title,
    description,
    path,
    alternates,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: t(`tools.${tool.id}.name`),
      description,
      url: absolute(path),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
    }
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

  usePageSeo({
    title: `${name} | ${t('site.name')}`,
    description,
    path: categoryPath(category, locale),
    alternates
  })
}
