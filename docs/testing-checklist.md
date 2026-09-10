# Toolkave — Human Testing Checklist

One entry per tool in the registry. Check a box only after you've actually used
the tool on a real file and it did what "Expect" says — not just "it didn't
crash." Flip `published: false` → `true` in [`app/data/tools.ts`](../app/data/tools.ts)
for a tool once it passes.

**How to test:** run `npm run dev`, then open `localhost:3000`. Every tool
below is reachable in dev mode, published or not — drafts show an amber
"Draft" badge on the page but work exactly like a live tool. Use the language
switcher (top of the page) to spot-check the `ru`/`uz` version of a tool once
the English pass is clean — same component, translated content, so the only
things that can differ are the words and Cyrillic-specific edge cases (flagged
below wherever they matter).

**What "Expect" means:** the specific, sometimes non-obvious behavior this
tool was built to have — a default, a guard against a bad state, what happens
at an edge. Generic things (does it look right, is the FAQ readable, does
Download work) apply to every tool and aren't repeated per entry.

**General checks worth doing on your first few tools, not repeated below:**
- Download produces a file that actually opens in a real viewer (Adobe
  Reader / Word / Excel / your OS's own image viewer), not just "a file downloaded."
- "Use as input" correctly chains into a related tool without re-uploading.
- "Start over" clears everything, including any in-progress state.
- Leaving the page mid-work (via the nav, not a reload) prompts a confirmation
  unless you're only switching locale on the same tool.
- Mobile width (or a narrow browser window): dropzone, buttons and any grid
  still work with a touch/tap, not just a mouse.

Registry snapshot at time of writing: **63 tools, 3 published, 60 drafts.**

---

## PDF (25)

- [ ] **Merge PDF** — combine multiple PDFs into one.
  Expect: add 3+ PDFs, drag to reorder (touch and keyboard both work on the
  drag handle), output page order matches the list order exactly.

- [ ] **Split PDF** — extract a page range into a new PDF.
  Expect: type a range like `1-3, 5`; the page-range field is the only input
  (no visual picker here — deliberately not upgraded, see docs). Invalid or
  out-of-bounds numbers in the range are just ignored, not an error.

- [ ] **Rotate PDF** — rotate some or all pages by 90/180/270°.
  Expect: **every page starts pre-selected** in the picker (rotating
  everything is the common case) — you exclude pages by clicking, not include
  them. Thumbnails load progressively; the range-text field above the grid
  works immediately even before thumbnails finish. Only the selected pages
  rotate; unselected ones are untouched.

- [ ] **Remove PDF pages** — delete pages from a PDF.
  Expect: picker starts with **nothing selected** (removal should be
  deliberate). Try selecting every page — the tool must refuse ("would leave
  an empty PDF") rather than produce a broken zero-page file.

- [ ] **JPG to PDF** — one or more JPGs into a single PDF, one page each.
  Expect: multi-file, reorderable, shares its component with PNG/WebP/HEIC to
  PDF below — confirm the "JPG" wording is correct on *this* page specifically
  (config-driven, easy for the wrong variant to leak through).

- [ ] **PNG to PDF** — same as JPG to PDF, for PNGs.
  Expect: same behavior; PNG transparency should not turn black in the output
  (page background should be white, not the alpha channel rendered as black).

- [ ] **WebP to PDF** — same shared component, WebP input.
  Expect: same behavior as JPG/PNG to PDF.

- [ ] **HEIC to PDF** — for iPhone photos.
  Expect: `heic2any` only downloads when a HEIC file is actually added — check
  the network tab stays quiet on page load. Conversion can be slow on a large
  batch; the page shouldn't look frozen while it works.

- [ ] **Add page numbers to PDF** — stamps a number on every page.
  Expect: position options (bottom-center etc.) all land correctly. **Type
  Cyrillic into any custom text field here and confirm the tool explicitly
  says it can't draw non-Latin text**, rather than silently producing empty
  boxes — this is a known, intentional limitation, not a bug to "fix."

- [ ] **Watermark PDF** — diagonal/repeated text watermark.
  Expect: same Latin-only limitation and same explicit message as page
  numbers, for the same reason (no embedded Cyrillic font).

- [ ] **PDF info** — read-only metadata viewer.
  Expect: page count, title/author/subject if present, encryption status.
  Test against both a plain PDF and a password-protected one (should still
  show the page count without needing the password).

- [ ] **Add header and footer to PDF** — text in the top/bottom margin.
  Expect: same Latin-only text limitation as watermark/page-numbers.

- [ ] **Resize PDF pages** — change page size (A4/Letter/etc.) or scale %.
  Expect: content is **centered** on the new page, not stuck in a corner.
  Test a landscape-oriented source — it should stay landscape at the new
  size, not get forced upright.

- [ ] **Flatten PDF** — bakes form field values into the page permanently.
  Expect: run it on a PDF that has no form fields at all — should return an
  unchanged copy with a message saying so, not an error.

- [ ] **Fill PDF form** — fill in a form PDF's fields in the browser.
  Expect: text, checkbox, dropdown and radio fields are all editable.
  Deliberately put a stale/invalid value in a dropdown-like field and confirm
  that one bad field doesn't stop the other fields from filling correctly.

- [ ] **Sign PDF** — draw a signature and place it on a page.
  Expect: works with touch/pen, not just mouse (uses Pointer Events). Read the
  FAQ text on the page itself — it must say plainly this is a picture of a
  signature, not a legally-binding cryptographic one. Try dragging the
  signature near a page edge — it should clamp inside the page, not hang off it.

- [ ] **Protect PDF with a password** — adds an open password.
  Expect: the output actually requires the password to open in a real PDF
  viewer, not just inside this site.

- [ ] **Unlock PDF** — removes a password, given the correct one.
  Expect: wrong password gives a clear "wrong password" message (not a crash
  or a generic error). Correct password produces an unlocked file that opens
  with no password in a real viewer.

- [ ] **Grayscale PDF** — converts a PDF to black-and-white for printing.
  Expect: **file size barely changes** and text stays selectable/searchable
  in the output (open it and try selecting a word) — this tool deliberately
  does *not* rasterize pages. Read the on-page notice: it should say the
  original colour data is still inside the file, this only affects display/print.

- [ ] **Word to PDF** — .docx converted to PDF in the browser.
  Expect: headings, bold/italic, lists, tables and images all come through.
  Read the on-page notice about page breaks landing differently than in Word
  — that's expected, not a bug. Test with a document containing Cyrillic and
  Uzbek (oʻzbek) text specifically. Try dropping an old `.doc` (not `.docx`)
  — should give a clear "old format" message, not a crash.

- [ ] **CSV to PDF** — turns a CSV into a printable table.
  Expect: try a **semicolon-delimited** CSV (Excel-Russian-locale export) —
  should auto-detect the delimiter correctly. Try a windows-1251-encoded file
  — Cyrillic should come out right, not as question marks. Try a table with
  8+ columns — the tool should suggest switching to landscape.

- [ ] **Excel to PDF** — one sheet of an .xlsx as a printable table.
  Expect: multi-sheet workbook — a sheet picker should appear and only the
  chosen sheet converts. Header row repeats on every page of a long table.

- [ ] **PDF to JPG** — export PDF pages as images.
  Expect: select exactly **one** page → downloads a single `.jpg`. Select
  **more than one** → downloads a `.zip` of numbered JPGs (and the "Use as
  input" button should *not* appear for a zip result — chaining a zip into
  another tool makes no sense). Try a 100+ page PDF — thumbnails should still
  load progressively without freezing the tab.

- [ ] **PDF to text** — extracts the text layer.
  Expect: run it on a **scanned** PDF (no real text layer) — result should be
  empty with a message suggesting the OCR tool instead, not a silent blank
  result.

- [ ] **Photos to scanned PDF** — phone photos of a document → clean PDF.
  Expect: try the three clean-up modes (Enhance / Grayscale / Keep colour) on
  the same photo — "Enhance" should visibly whiten the paper and darken the
  text compared to the original, more than "Grayscale" alone does. Multiple
  photos are reorderable before building the PDF.

- [ ] **Compress PDF** — shrinks a PDF by recompressing its embedded images only.
  Expect: on a **photo-heavy or scanned** PDF, the output should be
  noticeably smaller, and **text should still be selectable** in the result —
  select a word and copy it, confirm it pastes correctly. Try a **text-only**
  PDF with no images — the tool should say plainly there was nothing to
  compress, not silently return an unchanged file pretending to have helped.
  Try an already-small/low-quality image — it should be left alone rather
  than made larger by re-encoding it again.

- [ ] **Compare PDFs** — page-by-page diff between two versions of a document.
  Expect: upload the *same* PDF as both Document A and B — every page should
  read "Identical," nothing should be marked changed. Then edit a copy (change
  a sentence on one page, leave others alone) and compare against the
  original — only the edited page should show "Changed," and opening it
  should highlight the specific words that differ (additions and deletions in
  different colors), with both pages' thumbnails shown side by side. Try two
  PDFs with **different page counts** — the extra pages should read "Added"
  or "Removed," not get compared against nothing.

- [ ] **Annotate PDF** — highlight areas and add short text notes on a page.
  Expect: drag to highlight — the box should appear in the **exact area** you
  dragged over, in the downloaded file, not offset or resized. Add a note,
  confirm it's placed where you clicked. **Type Cyrillic into a note** and
  confirm it's rejected/skipped with a clear message rather than silently
  producing empty boxes in the output. Confirm the original page content
  (text underneath a highlight) is **completely unaffected** — this tool only
  draws on top, it must never look like it removed or hid anything.

- [ ] **Redact PDF** — permanently removes content under a drawn box, safely.
  **This is the one that matters most to get right.** Before testing, read the
  safety notice at the top of the page — it should say plainly that a
  redacted page becomes an image and its text is no longer selectable.
  Expect: draw a box over a piece of text, apply, download the result, then
  **try to select or copy text from underneath where the box was** — it must
  be completely impossible; there should be no hidden text layer at all on
  that page (try Ctrl+F / searching the PDF for a word that was under the
  box — it must not be found). Confirm pages you **didn't** mark are
  untouched — their text should still be normally selectable and searchable.
  Confirm the box itself renders as solid black with nothing showing through.
  Do not treat "the box looks black on screen" as sufficient — the whole
  point of this tool is what's *underneath* it, which only shows up by
  actually trying to extract the text.

---

## Image (6)

- [ ] **Compress image** — re-encode at a lower quality to shrink file size.
  Expect: output is visibly smaller; a quality slider actually changes output
  size when moved.

- [ ] **Resize image** — change width/height, keeping aspect ratio.
  Expect: enter only a width — height should auto-calculate to keep
  proportions (and vice versa).

- [ ] **PNG to JPG** — shares one component with the three below via `config`.
  Expect: transparent PNG areas should become **white** in the JPG output,
  not black.

- [ ] **JPG to PNG** — same shared component, other direction.
  Expect: straightforward re-encode, no transparency concerns going this way.

- [ ] **WebP to JPG** — same shared component, WebP input.
  Expect: same as PNG to JPG re: transparency → white background.

- [ ] **HEIC to JPG** — for iPhone photos, same shared component.
  Expect: `heic2any` should only load when a HEIC is actually dropped in.

---

## Converters (14)

- [ ] **Currency converter** — live exchange rates, no API key.
  Expect: page should say which source it used (CBU or the fallback) and the
  date of the rate. Turn off network / block the primary source if you can,
  to confirm the fallback actually engages instead of just failing.

- [ ] **Unit converter** — length/weight/etc.
  Expect: converting a value and converting it back should return (very
  close to) the original number.

- [ ] **Time zone converter** — convert a time between two zones.
  Expect: check a case crossing a date boundary (e.g. late evening in
  Tashkent to somewhere hours behind) — the date shown should actually
  change, not just the time.

- [ ] **DOCX to text** — plain text extraction (one of 3 pages sharing a
  component with HTML/Markdown below).
  Expect: Cyrillic and Uzbek text both come through correctly.

- [ ] **DOCX to HTML** — same shared component, HTML output.
  Expect: headings, lists, tables come through as real `<h1>`/`<ul>`/`<table>`
  — not Word's usual wall of inline styles. Check the page for any "style not
  recognized" notice if your test document uses unusual Word styles.

- [ ] **DOCX to Markdown** — same shared component, Markdown output.
  Expect: tables convert to proper GitHub-style Markdown tables (with the
  `| --- |` header separator row).

- [ ] **Markdown to HTML** — live preview as you type.
  Expect: switch to the Preview tab and confirm it actually renders (not just
  showing raw HTML text). Paste in a `<script>` tag inside a Markdown block —
  it must not execute in the preview.

- [ ] **HTML to Markdown** — reverse direction, same shared component.
  Expect: paste real page source (messy/unclosed tags) — should still convert
  without erroring. `<script>`/`<style>` content should be dropped entirely,
  not pasted in as text.

- [ ] **CSV to JSON** — one of six pages sharing a CSV/JSON/Excel component.
  Expect: a value like `007` or `0012` must stay a **string** in the output
  JSON, not become the number `7`. Semicolon-delimited files auto-detect correctly.

- [ ] **JSON to CSV** — reverse direction, same shared component.
  Expect: paste JSON with a nested object (e.g. `{"user":{"name":"..."}}`) —
  should become a column named `user.name`, not get dropped or stringified oddly.

- [ ] **CSV to Excel** — produces a real `.xlsx`, not a renamed CSV.
  Expect: open the result in Excel/LibreOffice — columns should already be
  split correctly, no import wizard needed, Cyrillic intact regardless of the
  source CSV's original encoding.

- [ ] **Excel to CSV** — pick a sheet, choose a delimiter.
  Expect: multi-sheet workbook shows a sheet picker. Try the BOM checkbox —
  with it on, the CSV should open correctly in Excel-Windows; check what
  happens with Cyrillic when it's off.

- [ ] **Excel to JSON** — sheet → array of objects.
  Expect: merged cells — value should land in the first cell of the merged
  range, not repeat across it.

- [ ] **JSON to Excel** — array of objects → real `.xlsx`.
  Expect: nested objects flatten into dotted column names, same as JSON to CSV.

---

## Calculators (4)

- [ ] **Percentage calculator** — percent-of, percent-change, VAT.
  Expect: check the VAT-inclusive vs VAT-exclusive modes both compute
  correctly (not just one of them).

- [ ] **Age calculator** — exact age / date difference.
  Expect: a case that crosses a month with a different number of days — e.g.
  Jan 31 to Mar 1 — must not come out negative or off-by-one. This is a real
  bug that existed and was fixed; worth deliberately re-checking.

- [ ] **BMI calculator** — height/weight → BMI + category.
  Expect: switching between metric and imperial units gives a consistent
  result for the same physical body.

- [ ] **Loan calculator** — monthly payment from principal/rate/term.
  Expect: try a **0% interest rate** specifically — should compute a plain
  division (principal ÷ months), not divide by zero or error.

---

## Generators (3)

- [ ] **QR code generator** — text/URL → downloadable QR image.
  Expect: scan the generated code with an actual phone camera and confirm it
  reads back correctly, including with Cyrillic text encoded in it.

- [ ] **YouTube thumbnail downloader** — paste a video URL, get the thumbnail.
  Expect: try a few real URL formats (`youtu.be/...`, `youtube.com/watch?v=...`,
  with extra query params) — all should resolve to the same thumbnail.

- [ ] **Password generator** — random password with configurable rules.
  Expect: toggling "exclude ambiguous characters" or similar options actually
  changes the character set used, not just cosmetic.

---

## Text (4)

- [ ] **Word counter** — words/characters/sentences/paragraphs/reading time,
  live as you type.
  Expect: works the same for Cyrillic and Latin text (counting is
  whitespace-based, not alphabet-specific).

- [ ] **Fix broken text** — repairs mojibake (wrong-encoding gibberish).
  Expect: has two modes — paste text, or upload a file — test both. Paste in
  genuinely broken Cyrillic (e.g. copy some `Ð¿Ñ€Ð¸Ð²ÐµÑ‚`-style garbage) and
  confirm it recovers the real Russian text. Just as important: paste in
  **normal, correct** text and confirm it's left completely alone, not
  "corrected" into something else.

- [ ] **Image to text (OCR)** — extract text from a photo/screenshot.
  Expect: try each language toggle (English / Russian / Uzbek Latin / Uzbek
  Cyrillic) — the first use of a language downloads its model (visible in the
  network tab), reused instantly after that. Check the confidence score
  shown — a blurry image should show a low-confidence warning, not just a
  silently bad result.

- [ ] **Word count for Word documents** — same UI as Word counter, plus a file
  loader for `.docx`/`.txt`.
  Expect: loading a `.docx` populates the text box and the same live counts
  apply. Try an old `.doc` file — should give the "old format" message, not crash.

---

## Developer (3)

- [ ] **Colour picker** — pick/convert a colour between HEX/RGB/HSL.
  Expect: entering a value in any one format updates all the others in sync.

- [ ] **Base64 / URL encoder-decoder** — text ⇄ Base64 / URL-encoded.
  Expect: round-trip (encode then decode) returns the exact original text,
  Cyrillic included.

- [ ] **JSON formatter** — pretty-print / validate JSON.
  Expect: paste invalid JSON — should point at what's wrong rather than
  failing silently or crashing the page.

---

Compress, Compare, Annotate and Redact are now built and listed above under
PDF — nothing left off this list by accident.
