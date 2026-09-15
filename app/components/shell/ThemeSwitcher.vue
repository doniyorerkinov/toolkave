<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from 'lucide-vue-next'
import { THEMES, type Theme } from '~/composables/useTheme'

/**
 * The theme menu, built to match the language one beside it — same trigger
 * shape, same dismiss behaviour, same menu. Two controls of the same size
 * that behave differently would be worse than either.
 *
 * The trigger shows the theme that is actually in force, so on "system" it
 * shows a monitor rather than guessing at a sun or a moon it cannot know.
 */
const { t } = useI18n()
const { theme, set } = useTheme()

const ICONS: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon }
const current = computed(() => ICONS[theme.value])

const open = ref(false)
const root = ref<HTMLElement | null>(null)
useDismissable(open, root)

function choose(next: Theme) {
  set(next)
  open.value = false
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1 rounded-full bg-white/10 p-1.5 text-xs font-semibold text-on-ink transition hover:bg-white/20 hover:text-white"
      :aria-label="t('nav.theme')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <component :is="current" :size="15" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="t('nav.theme')"
      class="absolute end-0 z-40 mt-1.5 min-w-40 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
    >
      <button
        v-for="option in THEMES"
        :key="option"
        type="button"
        role="menuitemradio"
        :aria-checked="theme === option"
        class="flex w-full items-center gap-2 px-3 py-2 text-start text-sm whitespace-nowrap transition"
        :class="
          theme === option
            ? 'font-semibold text-ember-900'
            : 'text-stone-700 hover:bg-stone-50 hover:text-stone-950'
        "
        @click="choose(option)"
      >
        <Check :size="14" :class="theme === option ? 'text-ember-700' : 'invisible'" aria-hidden="true" />
        <component :is="ICONS[option]" :size="14" aria-hidden="true" />
        {{ t(`theme.${option}`) }}
      </button>
    </div>
  </div>
</template>
