<script setup lang="ts">
import { Check, ChevronDown, Globe } from 'lucide-vue-next'
import { LOCALES, type Locale } from '~/data/tools'

/**
 * Switching language lands on the translated slug for the current page
 * (/text/word-counter -> /ru/tekst/schetchik-slov), resolved from the
 * registry. Locales where the page does not exist are not offered at all.
 *
 * Two shapes, because the two places want opposite things. In the header
 * space is the scarce thing, so it collapses to a code behind a menu. In the
 * footer there is room, and three plain links are better than a control —
 * they are crawlable, middle-clickable, and need no interaction to read.
 */
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t, locale, locales } = useI18n()
const alternates = useLocaleAlternates()

const options = computed(() => {
  const names = locales.value as { code: string; name?: string }[]
  return LOCALES.map(code => ({
    code,
    name: names.find(l => l.code === code)?.name ?? code,
    path: alternates.value[code as Locale]
  })).filter((option): option is { code: Locale; name: string; path: string } => !!option.path)
})

const current = computed(() => options.value.find(option => option.code === locale.value))

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

watch(open, isOpen => {
  if (!import.meta.client) return
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})

// Navigating away should not leave a menu hanging open behind the new page.
watch(() => alternates.value, () => (open.value = false))
void props
</script>

<template>
  <div v-if="compact" ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1 rounded-full bg-white/10 py-1.5 ps-2 pe-1.5 text-xs font-semibold text-on-ink transition hover:bg-white/20 hover:text-white"
      :aria-label="t('nav.language')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <Globe :size="14" aria-hidden="true" />
      <span class="uppercase">{{ current?.code }}</span>
      <ChevronDown :size="13" class="transition-transform" :class="open ? 'rotate-180' : ''" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="t('nav.language')"
      class="absolute end-0 z-40 mt-1.5 min-w-40 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
    >
      <NuxtLink
        v-for="option in options"
        :key="option.code"
        :to="option.path"
        role="menuitem"
        class="flex items-center gap-2 px-3 py-2 text-sm transition"
        :class="
          option.code === locale
            ? 'font-semibold text-ember-900'
            : 'text-stone-700 hover:bg-stone-50 hover:text-stone-950'
        "
        @click="open = false"
      >
        <Check :size="14" :class="option.code === locale ? 'text-ember-700' : 'invisible'" aria-hidden="true" />
        {{ option.name }}
      </NuxtLink>
    </div>
  </div>

  <nav v-else :aria-label="t('nav.language')" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
    <template v-for="option in options" :key="option.code">
      <span v-if="option.code === locale" class="font-semibold text-on-ink" aria-current="page">
        {{ option.name }}
      </span>
      <NuxtLink v-else :to="option.path" class="transition hover:text-white hover:underline">
        {{ option.name }}
      </NuxtLink>
    </template>
  </nav>
</template>
