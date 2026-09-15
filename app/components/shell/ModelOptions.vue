<script setup lang="ts">
/**
 * The half of a 3D tool that has nothing to do with where the shape came from.
 *
 * A drawing and a picture reach the outlines by completely different routes,
 * and then need exactly the same things asked of them: how big, how thick,
 * whether to soften the edge, whether to put a plate behind it, and what to
 * save it as. Kept here so the two tools cannot drift into offering the same
 * controls in different words.
 */
import type { Model } from '~~/shared/svg3d'
import type { ModelFormat } from '~/composables/useSvg3d'

const size = defineModel<number>('size', { required: true })
const depth = defineModel<number>('depth', { required: true })
const bevelled = defineModel<boolean>('bevelled', { required: true })
const plated = defineModel<boolean>('plated', { required: true })
const plate = defineModel<number>('plate', { required: true })
const format = defineModel<ModelFormat>('format', { required: true })

defineProps<{ model: Model | null; busy: boolean }>()
defineEmits<{ build: []; reset: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="mb-1.5 flex items-baseline justify-between text-sm font-medium text-stone-900">
          {{ t('model.sizeLabel') }}
          <span class="font-normal tabular-nums text-stone-500">{{ size }} mm</span>
        </span>
        <input v-model.number="size" type="range" min="10" max="200" step="1" class="w-full accent-ember-700" />
      </label>

      <label class="block">
        <span class="mb-1.5 flex items-baseline justify-between text-sm font-medium text-stone-900">
          {{ t('model.depthLabel') }}
          <span class="font-normal tabular-nums text-stone-500">{{ depth.toFixed(1) }} mm</span>
        </span>
        <input v-model.number="depth" type="range" min="0.5" max="20" step="0.5" class="w-full accent-ember-700" />
      </label>
    </div>

    <div class="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <label class="flex cursor-pointer items-start gap-2.5 text-sm text-stone-700">
        <input v-model="bevelled" type="checkbox" class="mt-0.5 size-4 accent-ember-700" />
        <span>
          {{ t('model.bevel') }}
          <span class="block text-xs text-stone-500">{{ t('model.bevelNote') }}</span>
        </span>
      </label>

      <label class="flex cursor-pointer items-start gap-2.5 text-sm text-stone-700">
        <input v-model="plated" type="checkbox" class="mt-0.5 size-4 accent-ember-700" />
        <span>
          {{ t('model.plate') }}
          <span class="block text-xs text-stone-500">{{ t('model.plateNote') }}</span>
        </span>
      </label>

      <label v-if="plated" class="block pl-6.5">
        <span class="mb-1.5 flex items-baseline justify-between text-sm text-stone-700">
          {{ t('model.plateDepth') }}
          <span class="tabular-nums text-stone-500">{{ plate.toFixed(1) }} mm</span>
        </span>
        <input v-model.number="plate" type="range" min="0.4" max="10" step="0.2" class="w-full accent-ember-700" />
      </label>
    </div>

    <fieldset>
      <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('model.formatLabel') }}</legend>
      <div class="grid gap-2 sm:grid-cols-3">
        <label
          v-for="option in (['stl', 'glb', 'obj'] as ModelFormat[])"
          :key="option"
          class="cursor-pointer rounded-lg border px-4 py-2.5 text-sm"
          :class="
            format === option
              ? 'border-ember-500 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
          "
        >
          <input v-model="format" type="radio" :value="option" class="sr-only" />
          <span class="font-medium">{{ option.toUpperCase() }}</span>
          <span class="block text-xs opacity-70">{{ t(`model.formats.${option}`) }}</span>
        </label>
      </div>
    </fieldset>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!model || busy"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="$emit('build')"
      >
        {{ busy ? t('image.working') : t('model.action', { format: format.toUpperCase() }) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="$emit('reset')"
      >
        {{ t('result.startOver') }}
      </button>
    </div>
  </div>
</template>
