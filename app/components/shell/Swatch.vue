<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { readableOn, rgbToHex, type Rgb } from '~~/shared/colour'
import { BY_HEX } from '~~/shared/colour-names'

/**
 * One colour, and one click to take it away with you.
 *
 * Every colour tool ends the same way — someone wants the hex in their
 * clipboard — so the swatch is the button rather than having a button beside
 * it. The label is drawn in whichever of black or white can actually be read
 * on the colour, which is the tool's own contrast maths doing its job.
 */
const props = withDefaults(
  defineProps<{
    colour: Rgb
    /** Shown under the hex, e.g. a scale step or a percentage. */
    caption?: string
    size?: 'sm' | 'md' | 'lg'
    /** Say the CSS name when the colour is exactly one. */
    showName?: boolean
  }>(),
  { caption: undefined, size: 'md', showName: false }
)

const { copied, copy } = useCopy()

const hex = computed(() => rgbToHex(props.colour))
const ink = computed(() => rgbToHex(readableOn(props.colour)))
const name = computed(() => (props.showName ? BY_HEX[hex.value] : undefined))

const box = computed(() =>
  props.size === 'sm' ? 'h-14' : props.size === 'lg' ? 'h-32 sm:h-40' : 'h-20 sm:h-24'
)
</script>

<template>
  <button
    type="button"
    class="group relative flex w-full flex-col justify-end overflow-hidden rounded-xl text-start transition hover:brightness-105 focus:ring-2 focus:ring-ember-500 focus:outline-none"
    :class="box"
    :style="{ backgroundColor: hex, color: ink }"
    :title="`Copy ${hex}`"
    @click="copy(hex)"
  >
    <span class="px-2.5 pb-2 text-xs font-semibold tracking-wide uppercase">
      <span class="flex items-center gap-1">
        <Check v-if="copied === hex" :size="12" aria-hidden="true" />
        {{ copied === hex ? 'Copied' : hex }}
      </span>
      <span v-if="name" class="block text-[11px] font-normal opacity-70">{{ name }}</span>
      <span v-if="caption" class="block text-[11px] font-normal opacity-70">{{ caption }}</span>
    </span>
  </button>
</template>
