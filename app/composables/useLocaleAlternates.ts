import {
  DEFAULT_LOCALE,
  LOCALES,
  categoryBySlug,
  categoryPath,
  toolBySlug,
  toolPath,
  type Locale
} from '~/data/tools'

/**
 * The equivalent path of the current page in every locale it exists in.
 *
 * Resolved from the registry rather than from `useSetI18nParams` /
 * `switchLocalePath`: with dynamic `[category]/[tool]` routes those fall back
 * to the current route's params, which produces cross-locale URLs such as
 * `/ru/text/word-counter` (Russian prefix, English slugs) that 404.
 *
 * Locales where the page does not exist are omitted, so the language switcher
 * never links to a missing page and hreflang never advertises one.
 */
export function useLocaleAlternates() {
  const route = useRoute()
  const { locale } = useI18n()

  return computed<Partial<Record<Locale, string>>>(() => {
    const current = locale.value as Locale
    const categorySlug = route.params.category ? String(route.params.category) : undefined
    const toolSlug = route.params.tool ? String(route.params.tool) : undefined
    const out: Partial<Record<Locale, string>> = {}

    if (categorySlug && toolSlug) {
      const tool = toolBySlug(categorySlug, toolSlug, current)
      if (tool) {
        for (const candidate of LOCALES) {
          const path = toolPath(tool, candidate)
          if (path) out[candidate] = path
        }
        return out
      }
    }

    if (categorySlug) {
      const category = categoryBySlug(categorySlug, current)
      if (category) {
        for (const candidate of LOCALES) {
          out[candidate] = categoryPath(category, candidate)
        }
        return out
      }
    }

    for (const candidate of LOCALES) {
      out[candidate] = candidate === DEFAULT_LOCALE ? '/' : `/${candidate}`
    }
    return out
  })
}
