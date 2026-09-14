# Presentation Editor — Plan

**Supersedes the presentation sections (Phases 1, 2 and 6) of
[toolkave-document-builders-plan.md](toolkave-document-builders-plan.md)** and
the spec's line *"not a slide editor"*. Decided 15 September 2026: it is one.
Resume and invoice are unaffected and keep their plan.

---

## The line

"Works like PowerPoint" can mean two different products, and the difference is
three weeks against a year. This is the first one.

**In — a slide editor:**
- Slides: add, delete, duplicate, reorder, jump between.
- Background per slide: solid colour, gradient, or an uploaded image (with a
  dimming slider so text stays readable over a photo).
- Text boxes: place, move, resize, edit in place. Font size, bold, italic,
  colour, alignment, line spacing. Title and body presets.
- Image elements: place, move, resize, keep aspect. Basic crop via the existing
  crop frame.
- Themes: a handful of colour + font sets that restyle every slide at once.
- Undo / redo, keyboard shortcuts, snap-to-guides.
- Starting points: blank, or a scaffold (school report, lesson, project
  defence), or paste an outline and get one slide per heading.
- Drafts saved locally; nothing uploaded.
- Export: **.pptx** (opens in PowerPoint, Google Slides, LibreOffice, Keynote)
  and **PDF**.

**Out — PowerPoint:**
- Opening and editing an existing `.pptx`. Writing PPTX is a library call;
  *reading* one faithfully is a parser for a twenty-year-old format with
  masters, layouts, placeholders and themes. Not on the table. The page says
  so, and offers PDF → slides (each page as an image) as the honest alternative.
- Animations, transitions, video, audio.
- Charts, SmartArt, a shapes library beyond rectangles and lines.
- Master slides and layouts as the user's concern — themes cover it.
- Collaboration, comments, cloud anything.

## Why it is feasible

**The editor's data model is the PPTX model.** `pptxgenjs` places every text
box and image by `x, y, w, h` on a slide, with a font face, size, colour and
alignment — exactly what an editor stores. There is no translation layer to
get wrong: what you drag is what is written.

One coordinate system, three renderings:

| | Slide is | An element at `x: 0.1, w: 0.8` becomes |
|---|---|---|
| Model | `0–1` of slide width and height | stored as-is |
| Preview | the stage's pixel width (fits the pane) | `left: 10%; width: 80%` |
| `.pptx` | **10 × 5.625 in** (16:9) | `x: 1.0in, w: 8.0in` |
| PDF | **720 × 405 pt** | `absolutePosition: { x: 72 }`, width 576 |

Fractions, so the same model exports at any size and the preview can be any
width without a recalculation.

## What the codebase already gives us

- **`useCropFrame`** — move a frame, resize from a corner against the opposite
  anchor, cursors, pointer capture. That is the element-drag interaction; it
  gets generalised from one frame to many elements.
- **`decodeImage` / `resizeImage`** in `useImage` — images downscaled to 1920px
  on import so a phone photo does not become a 12 MB slide.
- **pdfmake with Roboto**, cached — PDF export with `absolutePosition`, so text
  stays text rather than a screenshot.
- **`ToolShell`** — 1152px slot, SEO scaffolding, ad slot; **`ResultCard` +
  `downloadBytes`** — export delivery including the Telegram share sheet.
- **`useLocalDrafts`** — from Phase 0 of the builders plan, built here first.

## The model

Small on purpose. Everything the editor does is a pure function from one of
these to the next, which is what makes undo a stack of snapshots and export a
straight mapping.

```ts
interface Deck {
  version: 1
  theme: ThemeId
  slides: Slide[]
}
interface Slide {
  id: string
  background: { kind: 'color'; color: string }
            | { kind: 'gradient'; from: string; to: string; angle: number }
            | { kind: 'image'; image: ImageRef; dim: number }   // dim 0–0.8
  elements: Element[]                                          // z-order
}
type Element =
  | { kind: 'text'; id; x; y; w; h; text: string; style: TextStyle }
  | { kind: 'image'; id; x; y; w; h; image: ImageRef; crop?: Crop }
interface TextStyle {
  size: number; bold: boolean; italic: boolean; color: string
  align: 'left' | 'center' | 'right'; valign: 'top' | 'middle' | 'bottom'
  font: 'Arial' | 'Calibri' | 'Georgia' | 'Times New Roman'
  lineHeight: number
}
```

Images live once in an IndexedDB blob store and are referenced by id, so ten
slides using one photo store it once and a draft stays small.

---

## Phases and what you test at each

### Phase 0 — The stage · foundation

One slide, no chrome. Proves the interaction before anything is built on it.

- `components/builders/Stage.vue` — a 16:9 surface that fits its container;
  renders elements from fractions; selection outline; eight resize grips.
- `composables/useElementDrag.ts` — `useCropFrame` generalised: move, resize
  with aspect lock for images, arrow-key nudge, **snap** to slide edges, centre
  lines and other elements' edges (shown as guides while dragging).
- In-place text editing: `contenteditable` inside the box; Escape commits.
- `composables/useDeck.ts` — the model, immutable updates, **undo/redo** as a
  snapshot stack (Ctrl+Z / Ctrl+Shift+Z), and autosave through `useLocalDrafts`
  (IndexedDB, versioned, degrades to memory in a webview that refuses it).

**You test:** drag a text box around, resize it, type into it, undo ten times,
reload the page and find it where you left it. On a laptop and on your phone.

### Phase 1 — A deck

- Slide strip on the left: thumbnails rendered from the same `Stage` at small
  size, so they are always true; add / duplicate / delete / drag to reorder.
- Backgrounds: colour picker (the site's own), two-stop gradient, image upload
  with the dim slider. Images through `decodeImage` → `resizeImage(1920)`.
- Image elements: upload or paste; keep-aspect resize; crop via the crop frame.
- Toolbar for the selected text box: size, B / I, colour, align, valign, font.
- **Themes** — four to start, as data (`data/templates/presentation/*.ts`):
  background, title and body styles, accent. Switching a theme restyles every
  slide that has not been individually overridden.
- Text presets when adding a box: Title, Subtitle, Body, Caption.
- Mobile mode: on a touch screen under 768px, drag still works but the
  toolbar becomes a bottom sheet and the slide strip a horizontal row. It will
  be usable, not pleasant; presentations are made on laptops and this is stated
  rather than fought.

**You test:** make a real five-slide deck — a title, two text slides, one with
a photo background and text over it, one with a placed image.

### Phase 2 — `.pptx` export · the gate that matters

- `composables/useExportPptx.ts` — `pptxgenjs` behind a dynamic `import()`,
  never in the component graph. Deck → `addSlide` per slide, `background`
  from the model, `addText` / `addImage` at fractions × 10 × 5.625 in, fonts by
  name, colours as hex.
- Output through `ResultCard`, so download and the Telegram share sheet come
  free.
- Tests: unzip the result, count `ppt/slides/slideN.xml`, assert an element's
  `<a:off>` / `<a:ext>` EMU values match its fraction, assert the image part
  exists, assert Cyrillic and Uzbek Latin survive.

**You test — and this is the real gate:** open the Phase 1 deck in
**PowerPoint, Google Slides and LibreOffice**. Elements where you put them,
text wrapping close to the preview, photos not stretched. Publish only after
all three.

### Phase 3 — PDF, starting points, the outline door

- `useExportPdf` for decks: pdfmake, `pageSize: { width: 720, height: 405 }`,
  every element via `absolutePosition`. Text stays selectable text. Font is
  Roboto (the only one pdfmake embeds), so the preview shows Roboto metrics
  when PDF is the chosen export and the named family when `.pptx` is — the
  correction already recorded in the builders plan.
- Scaffolds in the chosen **document language** (independent of UI language):
  *School report · Lesson · Project defence · Business* — a title slide, a plan,
  three content slides, a conclusion.
- **Outline paste**: `#` title, `##` slide, `-` bullets → one slide per heading
  in the current theme. The spec's whole product, now a door into the editor.
- **Word → slides**: `mammoth` → headings and lists → the same importer. Its
  own registry entry (`config: { from: 'docx' }`) because "word to powerpoint"
  is a query people type.
- **PDF → slides**: pdfjs renders each page → a full-bleed image slide. Its
  own entry too. This is also the honest answer to "edit my existing
  presentation": export it to PDF, bring the pages in, add on top.

**You test:** the same deck as PDF, opened on a phone; a pasted outline
becomes sensible slides; a Word file with headings becomes a deck.

### Phase 4 — Polish

Keyboard shortcuts (Ctrl+D duplicate, Delete, arrows, Ctrl+C/V across
slides), multi-select, alignment tools (left / centre / distribute), a presenter
view that just shows slides full-screen with arrow keys — enough to present
from a browser in a classroom without exporting at all.

---

## Explicitly not planned, and why

| Asked for by the phrase "like PowerPoint" | Answer |
|---|---|
| Open and edit an existing `.pptx` | A faithful reader of the format is a project larger than this whole tool. Not planned. PDF → slides is offered instead, and the page says so plainly. |
| Animations, transitions | `pptxgenjs` cannot write most of them, and a PDF has none. Skipped. |
| Charts, tables | Tables in Phase 4 if cheap (`pptxgenjs` supports them); charts are "later" as in the spec. |
| Shapes | Rectangle and line only, as background blocks behind text. A shapes library is scope creep. |
| Video, audio | No. |

## Risks

- **Text wrap fidelity.** PowerPoint re-flows text with its own engine; a line
  that fits in the preview can wrap in the file. Mitigations: the same font
  family in both; boxes given a little slack; text presets sized for their
  boxes; and the gate above, which is the only real test. A "check it in
  PowerPoint before presenting" line stays on the page.
- **Fonts in `.pptx` are named, not embedded.** Arial, Calibri, Georgia and
  Times are on every Windows machine and in Google Slides. A school PC missing
  Calibri is unlikely; the fallback is Arial.
- **Editing on a phone.** Real, and real enough that the mode is designed
  rather than hoped for — but the honest expectation is that decks get made on
  laptops. The page does not pretend otherwise.
- **Image weight.** 1920px, JPEG 80% on import; 40 images per deck, warned
  at 30. A draft with thirty phone photos would otherwise be a 300 MB
  IndexedDB entry.
- **Bundle.** `pptxgenjs` only behind the export action; verified in the
  built chunk list before publishing.

## Tests

- `useDeck`: every operation as a pure function — add/move/resize/reorder
  produce the expected model; undo restores the previous snapshot exactly.
- Snapping: an element dragged to within the threshold lands on the guide.
- `.pptx`: zip contents as above, plus a golden deck compared XML-to-XML so an
  accidental change in coordinates fails the build.
- PDF: rendered with pdfjs; text found at the expected coordinates; page count.
- Drafts: save, reload, load — under `fake-indexeddb`.
- Importers: outline and `.docx` fixtures produce the expected slide count and
  titles.

## Order of building

0 → 1 → 2 → 3 → 4, each handed over when its "you test" line can be done.
Nothing is `published: true` before the Phase 2 gate passes in all three
viewers.
