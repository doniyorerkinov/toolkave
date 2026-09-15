<script setup lang="ts">
import { categoriesWithTools, categoryPath, type Locale } from '~/data/tools'

const { t, locale } = useI18n()
const localePath = useLocalePath()

const currentLocale = computed(() => locale.value as Locale)

// Only categories that actually have a published tool in this locale.
const navCategories = computed(() =>
  categoriesWithTools(currentLocale.value, import.meta.dev).map(category => ({
    id: category.id,
    name: t(`categories.${category.id}.name`),
    href: categoryPath(category, currentLocale.value)
  }))
)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
    >
      {{ t('nav.skipToContent') }}
    </a>

    <!-- The cave mouth: dark, with the ember mark as the one point of light. -->
    <header class="sticky top-0 z-30 border-b border-white/5 bg-ink/95 text-on-ink backdrop-blur">
      <div class="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4">
        <NuxtLink :to="localePath('/')" class="shrink-0 text-white">
          <ShellLogo />
        </NuxtLink>

        <!--
          The categories scroll sideways rather than wrapping to a second row:
          a header that changes height as you move between pages is worse than
          one you occasionally have to push. The masks are how you know there
          is more, since the scrollbar itself is hidden.
        -->
        <nav
          :aria-label="t('nav.allTools')"
          class="nav-scroll min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul class="flex items-center gap-0.5 text-sm whitespace-nowrap">
            <li v-for="category in navCategories" :key="category.id">
              <NuxtLink
                :to="category.href"
                class="block rounded-lg px-2.5 py-1.5 font-medium text-on-ink-dim transition hover:bg-white/10 hover:text-white"
                active-class="bg-white/10 text-white"
              >
                {{ category.name }}
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <ShellLanguageSwitcher compact class="shrink-0" />
      </div>
    </header>

    <main id="main" class="flex-1 scroll-mt-20">
      <slot />
    </main>

    <footer class="mt-16 bg-ink text-on-ink-dim">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <NuxtLink :to="localePath('/')" class="text-white">
            <ShellLogo />
          </NuxtLink>
          <p class="mt-3 max-w-sm text-sm leading-relaxed">{{ t('site.tagline') }}</p>
          <nav class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <NuxtLink
              v-for="page in ['about', 'privacy', 'terms', 'contact']"
              :key="page"
              :to="localePath(`/${page}`)"
              class="hover:text-white hover:underline"
            >
              {{ t(`legal.${page}.title`) }}
            </NuxtLink>
          </nav>
          <p class="mt-4 text-xs text-on-ink-dim opacity-80">
            © {{ new Date().getFullYear() }} {{ t('site.name') }} — {{ t('footer.rights') }}
          </p>
        </div>
        <ShellLanguageSwitcher />
      </div>
    </footer>
  </div>
</template>

<style scoped>
/*
 * Fade the ends of the category strip so a cut-off name reads as "there is
 * more this way" rather than as a rendering mistake. The mask is only drawn
 * where the strip actually overflows, which is what `scroll-timeline` would
 * do properly; until that is everywhere, both ends are always faded and the
 * cost of a fade over nothing is invisible on a dark bar.
 */
.nav-scroll {
  mask-image: linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent);
}
</style>
