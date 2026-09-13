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
    <header class="bg-stone-950 text-stone-100">
      <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <NuxtLink :to="localePath('/')" class="shrink-0 text-white">
          <ShellLogo />
        </NuxtLink>

        <nav
          :aria-label="t('nav.allTools')"
          class="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] sm:order-none sm:mx-0 sm:w-auto sm:min-w-0 sm:flex-1 sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <ul class="flex items-center gap-1 text-sm whitespace-nowrap">
            <li v-for="category in navCategories" :key="category.id">
              <NuxtLink
                :to="category.href"
                class="block rounded-full px-3 py-1.5 font-medium text-stone-300 transition hover:bg-white/10 hover:text-white"
                active-class="bg-white/10 text-white"
              >
                {{ category.name }}
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <div class="ms-auto shrink-0">
          <ShellLanguageSwitcher />
        </div>
      </div>
    </header>

    <main id="main" class="flex-1">
      <slot />
    </main>

    <footer class="mt-16 bg-stone-950 text-stone-400">
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
          <p class="mt-4 text-xs text-stone-500">
            © {{ new Date().getFullYear() }} {{ t('site.name') }} — {{ t('footer.rights') }}
          </p>
        </div>
        <ShellLanguageSwitcher />
      </div>
    </footer>
  </div>
</template>
