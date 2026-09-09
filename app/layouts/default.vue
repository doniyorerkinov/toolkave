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
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-900">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
    >
      {{ t('nav.skipToContent') }}
    </a>

    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <NuxtLink :to="localePath('/')" class="text-lg font-semibold tracking-tight text-slate-900">
          {{ t('site.name') }}
        </NuxtLink>

        <nav :aria-label="t('nav.allTools')" class="order-3 w-full sm:order-none sm:w-auto">
          <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <li v-for="category in navCategories" :key="category.id">
              <NuxtLink
                :to="category.href"
                class="text-slate-600 hover:text-slate-900 hover:underline"
              >
                {{ category.name }}
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <div class="ms-auto">
          <ShellLanguageSwitcher />
        </div>
      </div>
    </header>

    <main id="main" class="flex-1">
      <slot />
    </main>

    <footer class="mt-12 border-t border-slate-200 bg-white">
      <div
        class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"
      >
        <p>© {{ new Date().getFullYear() }} {{ t('site.name') }} — {{ t('footer.rights') }}</p>
        <ShellLanguageSwitcher />
      </div>
    </footer>
  </div>
</template>
