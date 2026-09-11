# Toolkave — Roadmap, Dev & Audio/Video Tools, Bot–Site Sync

Third file, alongside `toolkave-plan.md` and `toolkave-pdf-and-ui.md`. Covers what was decided after the core plan: what's in and out, the two extra categories (Dev, Audio/Video), the product-features backlog, and how the website and @toolkavebot work together.

---

## 1. Decisions (11 Sept 2026)

**In — build after the agreed core (48 tools) is live**
- **Dev tools** and **Audio/Video tools** — must-have categories. Keep them as sections (`/dev`, `/video`, `/audio`) on toolkave.com for at least the first year; search authority sticks to the domain. Split into their own domains only if a section becomes a brand of its own.
- **Product features** (PWA, chaining, presets, etc.) — worth doing, after some time.
- **Social media tools** — later, more tools in that direction.
- **Blog** — write on Medium instead of a self-hosted blog: "how we built X with Nuxt + pdf-lib" posts that mention toolkave. Brings readers and reach; Medium links are nofollow, so don't count them as SEO.

**Out**
- **Local Uzbek tools** (INN/PINFL checks, Payme/Click QR, apostrophe/tutuq belgisi fixer, etc.): government lookups aren't available to a tool site, banks already ship branded payment QRs, and a half-right Uzbek-language tool is worse than none while matn.uz / tilmoch exist.

**Expansion rule**
- If toolkave clears ~$200/month, the machine works; the next site is a copy with a different tool list (each big category could carry its own domain later). Target for toolkave itself remains $2–4k/month.

**Build order overall**
1. @toolkavebot (a day; there is a waiting user)
2. Core site: shell + 48 agreed tools, launched in waves
3. Dev + Audio/Video sections
4. Product features backlog
5. Social media tools, Medium posts, embeds/extension

---

## 2. Dev tools (`/dev`) — high-RPM audience

| Tool | Approach |
|---|---|
| JSON formatter / validator / minifier | plain JS (already in core) |
| Base64 / URL encoder-decoder | plain JS (already in core) |
| Color picker / HEX ⇄ RGB / palette | plain JS (already in core) |
| JWT decoder | plain JS |
| Regex tester (JS flavor, with explanation) | plain JS |
| UUID / ULID / nanoid generator | Web Crypto |
| Hash generator (MD5, SHA-1/256/512) | Web Crypto + small md5 lib |
| Cron expression builder / explainer | `cronstrue` |
| Timestamp ⇄ date converter | `dayjs` |
| Markdown preview / editor | `marked` + sanitizer |
| Text diff / JSON diff | `diff` |
| YAML ⇄ JSON ⇄ TOML | `js-yaml`, `@iarna/toml` |
| CSS minifier / beautifier, JS/HTML beautifier | `prettier` (browser build, lazy) |
| SQL formatter | `sql-formatter` |
| HTML entity encoder/decoder | plain JS |
| Lorem ipsum / fake data generator | `@faker-js/faker` (lazy) |
| .env / config validators, chmod calculator | plain JS |
| Meta tag / OG preview generator | plain JS |

All browser-only. Lazy-load prettier and faker.

---

## 3. Audio / Video tools (`/video`, `/audio`) — ffmpeg.wasm

All run in the browser with **ffmpeg.wasm** (~30 MB download on first use; cache it with a service worker). Heavy but huge search volume, and almost nobody does it client-side. Needs a Web Worker and a visible progress bar. Practical limits: files under ~500 MB, output under 2 GB (browser memory).

**Video**
| Tool | Notes |
|---|---|
| Compress video | re-encode with CRF; presets "for Telegram", "for email" |
| Trim / cut video | copy codec when possible (fast), re-encode otherwise |
| Video → GIF | fps + width options |
| Video → MP3 / extract audio | stream copy — fast |
| Convert MOV/AVI/MKV/WebM → MP4 | |
| Resize / change resolution | 1080p / 720p / 480p presets |
| Mute video | stream copy |
| Merge videos | same codec required; otherwise re-encode |
| Rotate / flip | |
| Change speed | |
| Video → frames / thumbnail | canvas or ffmpeg |
| Add watermark / logo | overlay filter |
| Instagram/TikTok/YouTube size presets (9:16, 1:1, 16:9) | crop/pad — SMM crossover |

**Audio**
| Tool | Notes |
|---|---|
| Convert MP3 / WAV / OGG / M4A / FLAC / AAC | |
| Trim / cut audio | |
| Merge audio | |
| Compress audio (bitrate) | |
| Change volume / normalize | loudnorm filter |
| Change speed / pitch | atempo |
| Fade in / out | |
| Voice message (OGG/Opus) → MP3 | very common Telegram need |
| Audio → waveform image | canvas |
| Text → speech | needs an API — later / premium |
| Speech → text (transcription) | Whisper via API or whisper.cpp WASM (heavy) — later / premium |

**Build order:** compress video · trim video · video → MP3 · convert to MP4 · video → GIF · convert audio · trim audio · OGG → MP3. Then the rest.

---

## 4. Product features backlog (after core is live)

- **PWA** — installable, offline; matches the "files never leave your device" story. Also caches ffmpeg.wasm.
- **Tool chaining** via the Pinia files store — "merged → compress → protect" without re-upload; Related tools become actions.
- **Batch mode** where it fits (compress 20 images at once).
- **Presets** — "for Instagram", "for passport photo", "for email under 1 MB", "for Telegram".
- **Recent tools + favorites** — device-local, no account.
- **Dark mode, keyboard shortcuts, paste-to-upload.**
- **Share a result link** — needs storage; later.
- **Embeddable widgets** (currency converter, QR) — each embed is a backlink.
- **Chrome extension** with the top 5 tools — separate distribution channel.
- **Telegram channel** posting one tool a day with a use case.
- **Public API** for converters — premium tier for developers, later.

**Social media tools (later):** image resizer for Instagram/Telegram/YouTube sizes, caption and hashtag helpers, story templates.

---

## 5. Website ↔ @toolkavebot sync

Both advertise each other; a user should recognize one from the other.

**Shared identity**
- Same name, icon, four languages (uz-latin, uz-cyrillic, ru, en), same tool names: "Rasmdan PDF" / "Фото в PDF" / "Images to PDF".
- Reuse the site registry's tool descriptions and FAQ text for the bot's help replies — translate once.

**Bot → site**
- After every result, one line: "More free tools: toolkave.com" + deep link to the matching page, e.g. `toolkave.com/pdf/images-to-pdf?ref=bot`.
- `/tools` command listing the site's categories with links.

**Site → bot**
- On every PDF and image page: "Do this in Telegram → @toolkavebot" button (more convenient on mobile).
- Deep link `t.me/toolkavebot?start=web_images` so the bot greets with the right tool.

**Tracking**
- `?ref=` on the site, `start` payload in the bot — see which side feeds the other.

---

## 6. @toolkavebot spec — Images → PDF

**Positioning:** free, no limit (the competing bot caps at 10 images — that cap is their paywall). Put "no limit, free" in the bot description and first message. First real user: a family member who hit the 10-image cap.

**Stack:** Python (aiogram) + `img2pdf` / Pillow, hosted on Railway (~$5/month) or a small VPS.

**Flow**
1. `/start` (with optional `start` payload from the site) → greeting in the user's Telegram language, one line of instructions.
2. User sends photos. Albums arrive as separate messages sharing a `media_group_id` — collect them and wait ~1–2 s for the group to finish. Also accept photos sent one by one and documents (images sent "as file").
3. Show a running count: "7 photos received. Send more or press Done."
4. **Done** button (or `/done`) → build PDF, page order = order received. To fix order, user re-sends; no reorder UI in chat.
5. Send result as a document named `scan_YYYY-MM-DD.pdf`, followed by the "More free tools" line.

**Options (inline buttons, optional):** page size A4 / fit-to-image; orientation auto; JPEG quality normal / high.

**Quality note in help text:** Telegram compresses photos; "send as file" keeps full quality — recommended for passports and documents.

**Limits:** ~100 images, ~50 MB total per PDF (still 10x the competitor). Reject politely above that.

**Privacy:** the site never uploads files, but the bot necessarily does. Delete files immediately after sending the PDF, and say so in the bot description: "Files are deleted immediately after processing."

**Later additions to the bot:** compress PDF, merge PDFs, PDF → images, image compress — the same tier-1 set as the site, once the web versions exist.

---

## 7. Checklist additions

- [ ] @toolkavebot live: album collection, Done flow, no-limit tagline, delete-after-send, ref links to site
- [ ] "Do this in Telegram" button on PDF/image pages with deep links
- [ ] `?ref=` / `start` payload tracking on both sides
- [ ] `/dev` section: JWT, regex, UUID, hash, cron, timestamp, markdown, diff, YAML⇄JSON, formatters
- [ ] `/video` + `/audio` sections: ffmpeg.wasm in a worker, service-worker caching, first 8 tools
- [ ] PWA + tool chaining + presets
- [ ] First Medium post: "Building a browser-only PDF toolkit with Nuxt and pdf-lib"
- [ ] Revisit domain split only if a section outgrows the site
