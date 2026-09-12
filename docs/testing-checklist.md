# Toolkave — Human Testing Checklist

One entry per tool in the registry. Check a box only after you've actually used
the tool on a real file and it did what "Expect" says — not just "it didn't
crash." Flip `published: false` → `true` in [`app/data/tools.ts`](../app/data/tools.ts)
for a tool once it passes.

**Before the human pass:** `npm test` and `npm run typecheck` must be green. The
test suite renders every PDF tool's output with pdf.js and checks placement on
pixels, so a tool that fails there is not ready for a person's time.

**How to test:** run `npm run dev`, then open `localhost:3000`. Every tool
below is reachable in dev mode, published or not — drafts show an amber
"Draft" badge on the page but work exactly like a live tool. In dev every tool
card and sidebar entry also carries a dot — **green** published, **red** still
to test — and the home page shows the running tally; none of that renders in
production. Use the language
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

Registry snapshot: **64 tools, 15 published, 49 drafts** (Merge, Split, Rotate, Remove pages, Page numbers, Header/footer, Watermark, PDF info, Resize pages, Flatten, Fill form, JPG/PNG/Image to PDF, Word counter).

**The order below is the testing order, and therefore the publishing order.** It is
ranked by search volume, by where the site has no competition, and by how much of your
time a tool costs to test; tools that share one component sit together so one thorough
pass plus a spot-check covers the set. Each wave is one deploy: test it, flip
`published`, `npm test && npm run typecheck && npm run deploy`, then start the next.

---

## Wave 0 — already live: verify first (3)

These three have real traffic and were published before the gate existed. They have
never had the pass every other tool is waiting for. Half an hour, today.

- [x] **Merge PDF** — combine multiple PDFs into one.
  Expect: add 3+ PDFs, drag to reorder (touch and keyboard both work on the
  drag handle), output page order matches the list order exactly.

- [x] **Split PDF** — extract a page range into a new PDF.
  Expect: type a range like `1-3, 5`; the page-range field is the only input
  (no visual picker here — deliberately not upgraded, see docs). Invalid or
  out-of-bounds numbers in the range are just ignored, not an error.

- [ ] **Word counter** — words/characters/sentences/paragraphs/reading time,
  live as you type.
  Expect: works the same for Cyrillic and Latin text (counting is
  whitespace-based, not alphabet-specific).

---

## Wave 1 — five-minute tools: high traffic, no test files (14)

Nothing here needs a file. Each is a few minutes with a keyboard, and together they are
the highest-volume queries on the site: "percentage calculator", "age calculator", "BMI",
"loan calculator", "QR code generator", "password generator" are each searched more than
any single PDF tool, and the dev tools bring the visitors that pay 5–10× per view.
Fourteen tools × three locales is 42 pages for Google in one afternoon — start the
indexing clock. **Fix broken text** is the flagship uz/ru page: nobody else has it.
**Currency** is the future sponsor page; test it on the deployed site too, since it
fetches CBU from the browser.

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

- [ ] **Unit converter** — length/weight/etc.
  Expect: converting a value and converting it back should return (very
  close to) the original number.

- [ ] **Currency converter** — live exchange rates, no API key.
  Expect: page should say which source it used (CBU or the fallback) and the
  date of the rate. Turn off network / block the primary source if you can,
  to confirm the fallback actually engages instead of just failing.

- [ ] **Time zone converter** — convert a time between two zones.
  Expect: check a case crossing a date boundary (e.g. late evening in
  Tashkent to somewhere hours behind) — the date shown should actually
  change, not just the time.

- [ ] **QR code generator** — text/URL → downloadable QR image.
  Expect: scan the generated code with an actual phone camera and confirm it
  reads back correctly, including with Cyrillic text encoded in it.

- [ ] **Password generator** — random password with configurable rules.
  Expect: toggling "exclude ambiguous characters" or similar options actually
  changes the character set used, not just cosmetic.

- [ ] **YouTube thumbnail downloader** — paste a video URL, get the thumbnail.
  Expect: try a few real URL formats (`youtu.be/...`, `youtube.com/watch?v=...`,
  with extra query params) — all should resolve to the same thumbnail.

- [ ] **JSON formatter** — pretty-print / validate JSON.
  Expect: paste invalid JSON — should point at what's wrong rather than
  failing silently or crashing the page.

- [ ] **Base64 / URL encoder-decoder** — text ⇄ Base64 / URL-encoded.
  Expect: round-trip (encode then decode) returns the exact original text,
  Cyrillic included.

- [ ] **Colour picker** — pick/convert a colour between HEX/RGB/HSL.
  Expect: entering a value in any one format updates all the others in sync.

- [ ] **Fix broken text** — repairs mojibake (wrong-encoding gibberish).
  Expect: has two modes — paste text, or upload a file — test both. Paste in
  genuinely broken Cyrillic (e.g. copy some `Ð¿Ñ€Ð¸Ð²ÐµÑ‚`-style garbage) and
  confirm it recovers the real Russian text. Just as important: paste in
  **normal, correct** text and confirm it's left completely alone, not
  "corrected" into something else.

---

## Wave 2 — tier-1 PDF: the traffic core (8)

Roughly 80 % of PDF search traffic sits in these. `npm test` already proves the maths
(rotation, page order, compression), so the human pass is about real files and the phone:
a scanned PDF stored sideways (`/Rotate 90`) for Rotate and Remove pages, a batch of phone
photos — including an iPhone HEIC — for the image-to-PDF pages, a 30+ page document for
PDF→JPG's zip, and for Compress both a scan (should shrink a lot) and a text-only file
(must say there is nothing to compress). The four image-to-PDF pages are one component:
test JPG fully, spot-check the wording and one file on each of the other three.

- [x] **Rotate PDF** — rotate some or all pages by 90/180/270°.
  Expect: **every page starts pre-selected** in the picker (rotating
  everything is the common case) — you exclude pages by clicking, not include
  them. Thumbnails load progressively; the range-text field above the grid
  works immediately even before thumbnails finish. Only the selected pages
  rotate; unselected ones are untouched.

- [x] **Remove PDF pages** — delete pages from a PDF.
  Expect: picker starts with **nothing selected** (removal should be
  deliberate). Try selecting every page — the tool must refuse ("would leave
  an empty PDF") rather than produce a broken zero-page file.

- [x] **JPG to PDF** — one or more JPGs into a single PDF, one page each.
  Expect: multi-file, reorderable, shares its component with PNG/WebP/HEIC to
  PDF below — confirm the "JPG" wording is correct on *this* page specifically
  (config-driven, easy for the wrong variant to leak through).

- [x] **PNG to PDF** — same as JPG to PDF, for PNGs.
  Expect: same behavior; PNG transparency should not turn black in the output
  (page background should be white, not the alpha channel rendered as black).

- [ ] **WebP to PDF** — same shared component, WebP input.
  Expect: same behavior as JPG/PNG to PDF.

- [ ] **HEIC to PDF** — for iPhone photos.
  Expect: `heic2any` only downloads when a HEIC file is actually added — check
  the network tab stays quiet on page load. Conversion can be slow on a large
  batch; the page shouldn't look frozen while it works.

- [ ] **PDF to JPG** — export PDF pages as images.
  Expect: select exactly **one** page → downloads a single `.jpg`. Select
  **more than one** → downloads a `.zip` of numbered JPGs (and the "Use as
  input" button should *not* appear for a zip result — chaining a zip into
  another tool makes no sense). Try a 100+ page PDF — thumbnails should still
  load progressively without freezing the tab.

- [ ] **Compress PDF** — shrinks a PDF by recompressing its embedded images only.
  Expect: on a **photo-heavy or scanned** PDF, the output should be
  noticeably smaller, and **text should still be selectable** in the result —
  select a word and copy it, confirm it pastes correctly. Try a **text-only**
  PDF with no images — the tool should say plainly there was nothing to
  compress, not silently return an unchanged file pretending to have helped.
  Try an already-small/low-quality image — it should be left alone rather
  than made larger by re-encoding it again.

---

## Wave 3 — images: one component, six pages (6)

"compress image", "png to jpg" and "heic to jpg" are enormous queries, the competition is
fierce, and the whole set is one component — a handful of photos covers it. Do one pass on
a phone (Safari matters here: HEIC decoding and the WebP-output message are Safari-specific)
and one on Windows, where HEIC files arrive with no MIME type.

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

## Wave 4 — the uz/ru moat (2)

Two tools nobody else builds, and the pages most likely to rank first in ru/uz. They
need real material: photos of Uzbek text in both alphabets and of Russian text for OCR,
and phone photos of an actual document for Scan to PDF. Worth doing carefully — these are
the pages to lead the ru/uz positioning with.

- [ ] **Image to text (OCR)** — extract text from a photo/screenshot.
  Expect: try each language toggle (English / Russian / Uzbek Latin / Uzbek
  Cyrillic) — the first use of a language downloads its model (visible in the
  network tab), reused instantly after that. Check the confidence score
  shown — a blurry image should show a low-confidence warning, not just a
  silently bad result.

- [ ] **Photos to scanned PDF** — phone photos of a document → clean PDF.
  Expect: try the three clean-up modes (Enhance / Grayscale / Keep colour) on
  the same photo — "Enhance" should visibly whiten the paper and darken the
  text compared to the original, more than "Grayscale" alone does. Multiple
  photos are reorderable before building the PDF.

---

## Wave 5 — document converters (12)

Mid-volume, low competition in ru/uz, and cheap: three components back twelve pages.
Test with what people here actually have — a .docx written in localised Word, a CSV
exported from Excel in a Russian locale (semicolons, windows-1251), a real .xlsx with two
sheets. One thorough pass per component, then a file through each of the other pages.

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

- [ ] **Word count for Word documents** — same UI as Word counter, plus a file
  loader for `.docx`/`.txt`.
  Expect: loading a `.docx` populates the text box and the same live counts
  apply. Try an old `.doc` file — should give the "old format" message, not crash.

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

## Wave 6 — tier-2 PDF edits (10)

Moderate volume each, and more UI surface than tier 1 (Fill form and Sign especially).
Bring the sideways scan again: every overlay here is placed as the viewer shows the page,
and the tests cover it, but a person should see it once. Page numbers, watermark and
header/footer are Latin-only by design — confirm the ru/uz pages say so before shipping.

- [x] **PDF info** — read-only metadata viewer.
  Expect: page count, title/author/subject if present, encryption status.
  Test against both a plain PDF and a password-protected one (should still
  show the page count without needing the password).

- [x] **Add page numbers to PDF** — stamps a number on every page.
  Expect: five styles (plain, "1 / 12", with a line, in a circle, in a box),
  six positions laid out like the page, a distance-from-edge slider in mm
  (default 15) and the placement preview all agree with the output. Try a
  sideways scan (`/Rotate 90`): the number must sit where the viewer shows
  it. **Type Cyrillic into the "text before the number" field and confirm
  the tool explicitly says it can't draw non-Latin text**, rather than
  silently producing empty boxes — a known, intentional limitation.

- [x] **Add header and footer to PDF** — text in the top/bottom margin.
  Expect: same Latin-only text limitation as watermark/page-numbers.

- [x] **Watermark PDF** — diagonal/repeated text watermark.
  Expect: same Latin-only limitation and same explicit message as page
  numbers, for the same reason (no embedded Cyrillic font).

- [x] **Resize PDF pages** — change page size (A4/Letter/etc.) or scale %.
  Expect: content is **centered** on the new page, not stuck in a corner.
  Test a landscape-oriented source — it should stay landscape at the new
  size, not get forced upright.

- [ ] **PDF to text** — extracts the text layer.
  Expect: run it on a **scanned** PDF (no real text layer) — result should be
  empty with a message suggesting the OCR tool instead, not a silent blank
  result.

- [x] **Fill PDF form** — fill in a form PDF's fields in the browser.
  Expect: text, checkbox, dropdown and radio fields are all editable.
  Deliberately put a stale/invalid value in a dropdown-like field and confirm
  that one bad field doesn't stop the other fields from filling correctly.

- [x] **Flatten PDF** — bakes form field values into the page permanently.
  Expect: run it on a PDF that has no form fields at all — should return an
  unchanged copy with a message saying so, not an error.

- [ ] **Sign PDF** — draw a signature and place it on a page.
  Expect: works with touch/pen, not just mouse (uses Pointer Events). Read the
  FAQ text on the page itself — it must say plainly this is a picture of a
  signature, not a legally-binding cryptographic one. Try dragging the
  signature near a page edge — it should clamp inside the page, not hang off it.

- [ ] **Annotate PDF** — highlight areas and add short text notes on a page.
  Expect: drag to highlight — the box should appear in the **exact area** you
  dragged over, in the downloaded file, not offset or resized. Add a note,
  confirm it's placed where you clicked. **Type Cyrillic into a note** and
  confirm it's rejected/skipped with a clear message rather than silently
  producing empty boxes in the output. Confirm the original page content
  (text underneath a highlight) is **completely unaffected** — this tool only
  draws on top, it must never look like it removed or hid anything.

---

## Wave 7 — trust-sensitive: verify in a real viewer (4)

A wrong answer here is not a bad download, it is a broken promise. Protect and Unlock
must be checked in Adobe Reader, not only in the site. Redact must be checked by trying
to copy the text under the box in a real viewer. Compare needs two genuine versions of a
document. Publish these only after that, and after the FAQ says what each one cannot do.

- [ ] **Protect PDF with a password** — adds an open password.
  Expect: the output actually requires the password to open in a real PDF
  viewer, not just inside this site.
  Known limitation (a `todo` test records it): the encryption library drops the
  document's title and author. Confirm the FAQ says so before publishing.

- [ ] **Unlock PDF** — removes a password, given the correct one.
  Expect: wrong password gives a clear "wrong password" message (not a crash
  or a generic error). Correct password produces an unlocked file that opens
  with no password in a real viewer.

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

- [ ] **Compare PDFs** — page-by-page diff between two versions of a document.
  Expect: upload the *same* PDF as both Document A and B — every page should
  read "Identical," nothing should be marked changed. Then edit a copy (change
  a sentence on one page, leave others alone) and compare against the
  original — only the edited page should show "Changed," and opening it
  should highlight the specific words that differ (additions and deletions in
  different colors), with both pages' thumbnails shown side by side. Try two
  PDFs with **different page counts** — the extra pages should read "Added"
  or "Removed," not get compared against nothing.

---

## Wave 8 — layout re-creation and niche: publish only if the output is good (4)

"Word to PDF" is a huge query, which is exactly the problem: it re-lays the document
out, and a visitor who expected Word's pagination leaves disappointed — a signal Google
notices. Test with real Uzbek and Russian documents that have tables and pictures, and
decide honestly whether the output earns the page. CSV/Excel to PDF are the same engine.
Grayscale is niche and display-level; last.

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

- [ ] **Grayscale PDF** — converts a PDF to black-and-white for printing.
  Expect: **file size barely changes** and text stays selectable/searchable
  in the output (open it and try selecting a word) — this tool deliberately
  does *not* rasterize pages. Read the on-page notice: it should say the
  original colour data is still inside the file, this only affects display/print.

---
