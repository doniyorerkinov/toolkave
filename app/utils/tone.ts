import type { CategoryId } from '~/data/tools'

/**
 * One hue per category, so a card's icon says where you are before you read
 * it. Class strings are written out in full: Tailwind only generates what it
 * can see verbatim in source.
 */
export interface Tone {
  /** The icon tile on cards and headers. */
  tile: string
  /** The tile while its card is hovered. */
  tileHover: string
  /** Text-only accent, e.g. the category chip on a tool page. */
  text: string
}

export const TONES: Record<CategoryId, Tone> = {
  pdf: { tile: 'bg-ember-100 text-ember-700', tileHover: 'group-hover:bg-ember-200', text: 'text-ember-700' },
  image: { tile: 'bg-teal-100 text-teal-700', tileHover: 'group-hover:bg-teal-200', text: 'text-teal-700' },
  color: { tile: 'bg-fuchsia-100 text-fuchsia-700', tileHover: 'group-hover:bg-fuchsia-200', text: 'text-fuchsia-700' },
  converters: { tile: 'bg-violet-100 text-violet-700', tileHover: 'group-hover:bg-violet-200', text: 'text-violet-700' },
  calculators: { tile: 'bg-emerald-100 text-emerald-700', tileHover: 'group-hover:bg-emerald-200', text: 'text-emerald-700' },
  generators: { tile: 'bg-pink-100 text-pink-700', tileHover: 'group-hover:bg-pink-200', text: 'text-pink-700' },
  video: { tile: 'bg-rose-100 text-rose-700', tileHover: 'group-hover:bg-rose-200', text: 'text-rose-700' },
  audio: { tile: 'bg-indigo-100 text-indigo-700', tileHover: 'group-hover:bg-indigo-200', text: 'text-indigo-700' },
  text: { tile: 'bg-blue-100 text-blue-700', tileHover: 'group-hover:bg-blue-200', text: 'text-blue-700' },
  dev: { tile: 'bg-stone-200 text-stone-700', tileHover: 'group-hover:bg-stone-300', text: 'text-stone-700' }
}
