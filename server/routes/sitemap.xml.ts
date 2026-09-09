import { LOCALES, categoriesWithTools, categoryPath, toolPath, tools } from '../../app/data/tools'

const SITE_URL = 'https://toolkave.com'

/**
 * Sitemap generated from the registry, with hreflang alternates per entry.
 * A tool only appears in the locales it is actually published in.
 */
export default defineEventHandler(event => {
  interface Entry {
    path: string
    alternates: { locale: string; path: string }[]
  }

  const entries: Entry[] = []

  // Home
  entries.push({
    path: '/',
    alternates: LOCALES.map(locale => ({
      locale,
      path: locale === 'en' ? '/' : `/${locale}`
    }))
  })
  for (const locale of LOCALES) {
    if (locale === 'en') continue
    entries.push({
      path: `/${locale}`,
      alternates: LOCALES.map(l => ({ locale: l, path: l === 'en' ? '/' : `/${l}` }))
    })
  }

  // Categories
  for (const locale of LOCALES) {
    for (const category of categoriesWithTools(locale)) {
      entries.push({
        path: categoryPath(category, locale),
        alternates: LOCALES.map(l => ({ locale: l, path: categoryPath(category, l) }))
      })
    }
  }

  // Tools
  for (const tool of tools) {
    const alternates = LOCALES.map(l => ({ locale: l as string, path: toolPath(tool, l) })).filter(
      (a): a is { locale: string; path: string } => typeof a.path === 'string'
    )

    for (const locale of tool.locales) {
      const path = toolPath(tool, locale)
      if (!path) continue
      entries.push({ path, alternates })
    }
  }

  const absolute = (path: string) => (path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`)

  const urls = entries
    .map(entry => {
      const links = entry.alternates
        .map(
          alt =>
            `    <xhtml:link rel="alternate" hreflang="${alt.locale}" href="${absolute(alt.path)}"/>`
        )
        .join('\n')
      return `  <url>\n    <loc>${absolute(entry.path)}</loc>\n${links}\n  </url>`
    })
    .join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`
})

