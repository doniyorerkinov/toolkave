import type { LayoutCell } from '~/composables/useImage'

/**
 * Collage layouts, as fractions of the sheet.
 *
 * The uneven ones are the reason to have this at all: a plain grid gives
 * every picture the same weight, and the whole point of a collage is usually
 * that one picture is the main one. The first cell of each layout is the
 * feature, so the first picture in the list lands there without anyone
 * having to work out which cell is which.
 */
export interface Layout {
  id: string
  cells: LayoutCell[]
}

const third = 1 / 3

export const LAYOUTS: Layout[] = [
  {
    id: 'pair',
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 }
    ]
  },
  {
    id: 'stack',
    cells: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 }
    ]
  },
  {
    id: 'big-left',
    cells: [
      { x: 0, y: 0, w: 0.62, h: 1 },
      { x: 0.62, y: 0, w: 0.38, h: 0.5 },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5 }
    ]
  },
  {
    id: 'big-top',
    cells: [
      { x: 0, y: 0, w: 1, h: 0.62 },
      { x: 0, y: 0.62, w: 0.5, h: 0.38 },
      { x: 0.5, y: 0.62, w: 0.5, h: 0.38 }
    ]
  },
  {
    id: 'quarters',
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    ]
  },
  {
    id: 'big-left-three',
    cells: [
      { x: 0, y: 0, w: 0.6, h: 1 },
      { x: 0.6, y: 0, w: 0.4, h: third },
      { x: 0.6, y: third, w: 0.4, h: third },
      { x: 0.6, y: third * 2, w: 0.4, h: third }
    ]
  },
  {
    // One in the middle with the others around it, like a mount board.
    id: 'centre-four',
    cells: [
      { x: 0.24, y: 0.22, w: 0.52, h: 0.56 },
      { x: 0, y: 0, w: 1, h: 0.22 },
      { x: 0, y: 0.22, w: 0.24, h: 0.56 },
      { x: 0.76, y: 0.22, w: 0.24, h: 0.56 },
      { x: 0, y: 0.78, w: 1, h: 0.22 }
    ]
  },
  {
    id: 'feature-four',
    cells: [
      { x: 0, y: 0, w: 1, h: 0.6 },
      { x: 0, y: 0.6, w: 0.25, h: 0.4 },
      { x: 0.25, y: 0.6, w: 0.25, h: 0.4 },
      { x: 0.5, y: 0.6, w: 0.25, h: 0.4 },
      { x: 0.75, y: 0.6, w: 0.25, h: 0.4 }
    ]
  },
  {
    id: 'mosaic',
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.25, h: 0.5 },
      { x: 0.75, y: 0.5, w: 0.25, h: 0.5 }
    ]
  },
  {
    id: 'six',
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.25, h: 0.5 },
      { x: 0.75, y: 0, w: 0.25, h: 0.5 },
      { x: 0, y: 0.5, w: 0.25, h: 0.5 },
      { x: 0.25, y: 0.5, w: 0.25, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    ]
  }
]

/** Sheet shapes, as width over height. */
export const ASPECTS: { id: string; value: number }[] = [
  { id: 'square', value: 1 },
  { id: 'portrait', value: 4 / 5 },
  { id: 'landscape', value: 3 / 2 },
  { id: 'story', value: 9 / 16 }
]
