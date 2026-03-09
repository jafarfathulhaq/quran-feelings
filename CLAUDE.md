# CLAUDE.md — TemuQuran

## Project overview
**TemuQuran** — a privacy-first web app with five modes: (1) **Curhat** — users describe feelings and receive emotionally resonant Qur'anic verses, (2) **Panduan Hidup** — users ask life-guidance questions and receive topically relevant Qur'anic verses with scholarly explanations, (3) **Jelajahi Al-Qur'an** — users browse and read Quran verses by surah, juz, or natural language query (no AI needed for presets), (4) **Ajarkan Anakku** — helps Muslim parents explain Qur'anic concepts to children using pre-generated, age-appropriate content (no live AI for presets), (5) **Belajar Bareng Nuri** — multi-turn conversational Quran learning companion with guided curriculum mode, learning paths, and free chat. No user text is ever stored.

- **Live URL**: https://temuquran.com (custom domain on Vercel, DNS via Namecheap)
- **Legacy URL**: https://quran-feelings.vercel.app (redirects to temuquran.com)
- **Deploy**: `git push origin main` → auto-deploys on Vercel (no build step)
- **Preview**: `preview_start` with `quran-feelings` config in `.claude/launch.json` (port 8766). API calls to Supabase/OpenAI only work on deployed Vercel, not locally.

---

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (`index.html`, `css/*.css`, `js/*.js`) — no build step |
| Backend | Vercel Serverless Functions (`api/*.js`, Node 20) |
| Database | Supabase (PostgreSQL + pgvector) |
| AI | OpenAI — `gpt-4o-mini` (verse selection, HyDE, decompose, jelajahi intent parser), `text-embedding-3-large` (1536 dims) |
| Analytics | Supabase `analytics_events` table via `/api/log-event` + Google Analytics GA4 (`G-NWKWSKTNS0`) via `gtag()` |
| PWA | `manifest.json` + `sw.js` |

---

## Key files
```
index.html          — single-page shell (9 views: landing-view, selection-view, panduan-view, jelajahi-view, ajarkan-view, verses-view, nuri-view, journal-view, paths-list-view + path-preview-view + lesson-view + path-complete-view)
package.json        — dependencies: web-push, @supabase/supabase-js, openai
css/                — split CSS files (12 files, no framework, no build)
  base.css          — :root variables, reset, views, landing cards, entrance animation
  panduan.css       — panduan card, expanded view
  jelajahi.css      — surah browser, juz list, intro card, progress bar
  hero.css          — hero header gradient, floating input, search textarea
  curhat.css        — emotion grid, results header, chat thread
  verse-cards.css   — verse carousel, verse card, dark Arabic, tafsir panel
  tafsir.css        — tafsir overlay, summary card, accordion
  components.css    — verse action row, A2HS, about/FAQ, daily card, VOTD
  share.css         — share sheet, image themes, text share toggles
  ajarkan.css       — ajarkan categories, age toggle, result cards
  belajar.css       — belajar tabs, path preview, lesson view, bottom sheet
  nuri.css          — nuri chat bubbles, typing indicator, quick replies
js/                 — split JS files (13 files, no framework, no build, plain <script defer>)
  data.js           — all data constants (SURAH_META, categories, icons, config)
  core.js           — shared utils (escapeHtml, switchView, logEvent, fetchAyat, audio)
  verse-card.js     — buildVerseCard, carousel, swipe hints, pagination
  tafsir.js         — tafsir overlay, about/FAQ overlay
  share.js          — share sheet, image generation, text share
  curhat.js         — emotion cards, curhat search
  panduan.js        — panduan cards, sub-question drill-down
  jelajahi.js       — surah browser, juz overlay, jelajahi search/rendering
  ajarkan.js        — ajarkan categories, filter, result cards, age toggle
  daily-card.js     — daily rotating card, VOTD
  belajar.js        — belajar tabs, paths, lessons, onboarding, bottom sheet
  nuri.js           — nuri chat, message send/receive, quick replies
  init.js           — DOMContentLoaded bootstrap, event listeners, SW registration
api/
  get-ayat.js       — main AI pipeline (rate-limit → HyDE → embed → vector search → GPT select), mode-aware (curhat/panduan/jelajahi/ajarkan)
  nuri.js           — Nuri chat API (rate-limit → GPT-4o-mini JSON → verse lookup/semantic fallback → tafsir grounding → placeholder replacement). Also handles guided learning state.
  curricula.js      — GET /api/curricula — returns 9 curricula with path details, lesson counts
  learning-paths.js — GET /api/learning-paths, GET /api/learning-paths/[pathId], GET /api/learning-paths/suggest
  learning-paths/lesson/[lessonId].js — POST, GPT lesson generation (handles 429 rate limit)
  log-event.js      — privacy-safe analytics proxy (event allowlist, no user text)
  verse-of-day.js   — serves a daily verse from data/verses.json, cached by day
data/verses.json    — curated verses for Verse of the Day feature
supabase/migrations/
  001_quran_verses.sql   — quran_verses table + pgvector column
  002_hybrid_search.sql  — match_verses_hybrid RPC (vector + full-text hybrid search)
  003_asbabun_nuzul.sql  — adds asbabun_nuzul + asbabun_nuzul_id columns
  005_ajarkan_queries.sql — ajarkan_queries table (pre-generated content for Ajarkan Anakku)
scripts/
  seed_asbabun_nuzul.py      — fetches English asbabun nuzul from spa5k/tafsir_api (Al-Wahidi)
  translate_asbabun_nuzul.py  — translates to Indonesian via OpenAI Batch API
  seed_ajarkan.py            — seeds ajarkan_queries table (325 questions × 2 age groups)
  seed-curricula.mjs         — seeds curricula table (9 curricula with path mappings)
nuri-decision-tree.html — interactive visualization of all Nuri conversation branching logic (29 flow nodes, dev reference only, uncommitted)
qris.png            — QRIS payment QR code image for the Dukung (support) section
vercel.json         — maxDuration 30s, security headers (CSP, X-Frame-Options, etc.), redirect vercel.app → temuquran.com
```

---

## Environment variables (`.env` locally, Vercel dashboard for production)
```
OPENAI_API_KEY          — OpenAI secret key
SUPABASE_URL            — https://ryafjohcmqaoeeittvxi.supabase.co
SUPABASE_SERVICE_KEY    — service role key (server-side only, never in client)
SUPABASE_ANON_KEY       — anon/public key (used in API functions for DB queries)
```

---

## AI pipeline (`api/get-ayat.js`)

### Curhat / Panduan modes
Each search makes **5–6 parallel AI calls** then one sequential GPT-4o call:

1. **Decompose** (`gpt-4o-mini`) — splits multi-issue input into up to 3 distinct needs (spiritual needs for curhat, topics for panduan)
2. **HyDE × 3** (`gpt-4o-mini`) — generates hypothetical Qur'anic descriptions. Curhat uses emotional / situational / divine-hope angles; Panduan uses topical / ethical / practical angles
3. **Embed × 3** (`text-embedding-3-large`, 1536 dims) — embeds the three HyDE texts
4. **Hybrid search × 3** (Supabase `match_verses_hybrid` RPC) — 20 results per angle, round-robin merged, deduped, surah-diversity filtered → top 25 candidates
5. **Select** (`gpt-4o-mini`) — picks 3–7 verses (3–4 for focused queries, 5–7 for complex/multi-dimensional). Curhat writes `reflection` + `verse_resonance`; Panduan writes `explanation` + `verse_relevance`
6. **Tafsir fetch** (Supabase REST) — fetches `tafsir_kemenag`, `tafsir_ibnu_kathir`, `tafsir_ibnu_kathir_id` for the selected verses only

**Mode**: POST body accepts `mode` (`'curhat'` default, `'panduan'`, `'jelajahi'`, `'ajarkan'`). Mode forks prompts at steps 1, 2, and 5. Ajarkan has its own pipeline (see below).
**Cache**: in-memory per container, 24h TTL, 500 entries max (FIFO eviction). Cache key prefixed with `mode:`. `refresh: true` bypasses lookup but still writes result.
**Rate limit**: 20 requests / IP / hour, in-memory. Returns `resetAt` timestamp → frontend shows exact minutes.

### Jelajahi mode
Completely different pipeline — no vector search, no GPT-4o verse selection:

- **Preset taps**: bypass AI entirely. Frontend sends `intent` object (e.g. `{ type: 'surah', surah: 112 }`). API queries Supabase REST directly for the matching verses. Zero OpenAI cost, no rate limit.
- **Typed queries**: parsed by `gpt-4o-mini` intent parser (~$0.0001/call) into structured JSON intent (`{ type: 'surah'|'ayat'|'ayat_range'|'juz', surah, ayah_start, ayah_end, juz }`). Then same direct DB query.
- **Cache**: 7-day TTL for jelajahi (vs 24h for curhat/panduan).
- **Rate limit**: Presets exempt. Typed queries count toward the normal rate limit.
- **Juz type**: Returns `{ type: 'surah_list' }` response — frontend shows surah list overlay instead of verses.

### Ajarkan Anakku mode
Completely different pipeline — uses pre-generated content from `ajarkan_queries` table:

- **Preset taps**: bypass AI entirely. Frontend sends `questionId` + `ageGroup`. API queries `ajarkan_queries` for the matching row, hydrates verse references from `quran_verses`. Zero OpenAI cost, no rate limit.
- **Freeform queries**: 2-step GPT-4o-mini matcher (~$0.0002/call). Step 1: category match (classifies query into subcategory slugs). Step 2: question match (picks best question_id + confidence + 3 similar). Confidence ≥ 0.8 → clean match; 0.5–0.79 → match + suggestions; < 0.5 → suggestions only.
- **Cache**: 7-day TTL (static pre-generated content).
- **Rate limit**: Presets exempt. Freeform queries count toward the normal rate limit (20/hr/IP).
- **Age groups**: `'under7'` (balita/TK) and `'7plus'` (SD). Same verses, different `penjelasan_anak` and `pembuka_percakapan`.
- **Result cards**: 3 cards total — Penjelasan (Card 0, instant fade-in, with collapsible verse mini-cards), Cara Ngobrol (Card 1, segmented toggle to pick Pertanyaan or Cerita approach), Coba Lakukan (Card 2, clean activity box only). No separate verse cards — verse references are consolidated in Card 0.
- **DB table**: `ajarkan_queries` — `question_id` + `age_group` unique pair. 325 questions × 2 age groups = 650 rows. JSONB fields: `selected_verses`, `pembuka_percakapan`.

---

## Analytics (`api/log-event.js`)
Dual-send from `logEvent()` in `app.js`: (1) Supabase via POST to `/api/log-event` (allowlisted events only), (2) GA4 via `gtag('event', ...)` (all events, no allowlist). **Never logs user text.** Each event includes `session_id` (random per tab, `sessionStorage`). GA4 tag loaded async in `index.html`; `dataLayer` + `gtag()` initialized at top of `app.js`.

Valid event types:
`mode_selected`, `search_started`, `search_completed`, `search_cached`, `mood_feedback`,
`verse_saved`, `verse_unsaved`, `verse_shared`, `verse_played`, `tafsir_opened`, `tafsir_tab`,
`asbabun_nuzul_opened`, `card_expanded`, `sub_question_selected`, `tulis_sendiri_opened`, `verse_swiped`,
`jelajahi_search`, `jelajahi_juz_surah_selected`, `jelajahi_surah_browser`, `jelajahi_juz_group_opened`, `jelajahi_multi_selected`,
`share_sheet_opened`, `share_theme_selected`, `share_completed`, `share_mode_selected`, `share_wa_sent`, `share_wa_copied`,
`tafsir_summary_opened`, `tafsir_summary_swiped`, `tafsir_full_opened`, `tafsir_full_tab_switched`, `tafsir_overlay_closed`,
`a2hs_tapped`, `a2hs_installed`, `about_opened`, `about_faq_tapped`, `qris_saved`,
`ajarkan_search_started`, `ajarkan_search_completed`, `ajarkan_search_partial_match`, `ajarkan_not_available`,
`ajarkan_suggestion_tapped`, `ajarkan_age_under7_selected`, `ajarkan_age_7plus_selected`,
`ajarkan_category_tapped`, `ajarkan_question_selected`, `ajarkan_question_filtered`,
`ajarkan_conversation_copied`, `ajarkan_penjelasan_copied`, `ajarkan_aktivitas_viewed`,
`ajarkan_verse_expanded`, `ajarkan_card_swiped`, `ajarkan_panduan_fallback`, `ajarkan_query_miss`,
`nuri_session_started`, `nuri_exchange_completed`, `nuri_error`, `nuri_session_ended`,
`lp_path_started`, `lp_lesson_viewed`, `lp_path_completed`, `lp_audio_played`

To query analytics:
```sql
-- Supabase SQL editor or REST API with service key
SELECT event_type, count(*) FROM analytics_events
WHERE created_at > now() - interval '7 days'
GROUP BY event_type ORDER BY count DESC;
```

---

## Frontend architecture (`js/*.js`)

### Views & navigation
- **Seven views**: `landing-view` → `selection-view` (curhat) / `panduan-view` (panduan) / `jelajahi-view` (jelajahi) / `ajarkan-view` (ajarkan) → `verses-view` (results). `nuri-view` (chat mode). `switchView(id)` swaps the `.active` class.
- **Landing**: 4 mode cards (Curhat, Panduan Hidup, Ajarkan Anakku, Jelajahi Al-Qur'an) + Nuri section ("✨ KENALAN SAMA NURI" label + dark teal card + "Mulai Ngobrol →" CTA) + VOTD section below a divider + A2HS install card ("Jadikan TemuQuran aplikasi di HP")
- **Back navigation stack**:
  - Curhat: verses → selection-view → landing
  - Panduan: verses → expanded card (if came from sub-question) → panduan grid → landing
  - Jelajahi: verses → juz surah list (if came from Juz Amma) → jelajahi presets → landing
  - Ajarkan: verses → expanded category (if came from drill-down) → ajarkan-view → landing
  - Nuri: ← arrow in chat header → landing (scrolls to Nuri section)

### State variables
- `currentMode` (`'curhat'`, `'panduan'`, `'jelajahi'`, or `'ajarkan'`)
- `expandedCardId` — active panduan sub-question card ID, or null
- `currentCardIndex` / `totalVerseCards` — carousel position and total slides
- `jelajahiAllVerses` — full verse array for lazy loading
- `jelajahiLoadedUpTo` — how many verses have been rendered as slides
- `jelajahiSurahInfo` — surah metadata for the intro card
- `juzSurahListVisible` — whether the juz surah list overlay is showing
- `lastJuzSurahTapped` — surah number if user came from juz list (for back nav)
- `shareTheme` / `shareIncludeQuestion` / `shareIncludeTafsir` / `shareActiveVerse` / `shareLastPlatform` — image share sheet state
- `shareTextPrefs` — text share toggle states (loaded from `localStorage.share_prefs` via `loadSharePrefs()`)
- `_swipeHintTimers` — array of setTimeout IDs for the swipe hint sequence (peek nudge + auto-advance); cleared on first user swipe
- `ajarkanAgeGroup` — `'under7'` | `'7plus'` | `null`
- `ajarkanExpandedCatId` — expanded category ID in the drill-down overlay
- `ajarkanCurrentData` — last result data (for age switch re-fetch)
- `ajarkanCurrentQId` — last question ID (for age switch re-fetch)

### Key data constants
- `SURAH_META` — 114 entries with `{ number, name, name_arabic, verses, type }` (~5KB)
- `SURAH_BROWSER` — 10 Juz groups (flat array), each `{ label, surahs: [numbers] }`. Groups: Juz 1–5, 6–10, 11–15, 16–20, 21–25, 26, 27, 28, 29, 30
- `JUZ_30_SURAHS` — filtered subset of SURAH_META (surahs 78–114)
- `PANDUAN_SUB_QUESTIONS` — 10 categories × 8 sub-questions
- `AJARKAN_CATEGORIES` — 6 categories with 20 subcategories, 325 total questions (inline in app.js, ~500 lines)
- `BISMILLAH_AR` / `BISMILLAH_NFC` — Bismillah constant for stripping/display

### Bismillah handling
In the DB, verse 1 of every surah (except At-Tawbah/9) includes Bismillah as a prefix. For Jelajahi mode:
- **Al-Fatihah (1)**: Bismillah stays as verse 1 (it IS the verse)
- **At-Tawbah (9)**: No Bismillah at all
- **All other surahs**: `stripBismillah()` removes it from verse 1's Arabic text; shown on intro card in gold instead
- Uses **NFC Unicode normalization** for reliable matching (DB diacritics ordering may differ)

### Curhat mode
- **Emotion cards**: 13 preset emotions → fire `fetchAyat()` with a fixed feeling string
- **Text input**: freeform feelings text → same `fetchAyat()` pipeline

### Panduan Hidup mode
- **Panduan presets**: 10 preset topics → tap expands to sub-questions drill-down (`expandPanduanCard()`) with 8 sub-questions + "Tulis sendiri", teal accent cards
- **Sub-questions**: `PANDUAN_SUB_QUESTIONS` object keyed by hyphenated ID. Expanded view is a fixed-position overlay (`#panduan-expanded`)

### Jelajahi Al-Qur'an mode
- **Hero + search input**: text input for natural language queries ("Surah Maryam", "Al-Baqarah ayat 255")
- **Surah browser**: categorized accordion with 10 Juz groups (`SURAH_BROWSER` array). Single-open behavior — expanding one group collapses others. Each group header shows label + surah count badge. Surah rows have rounded number badges, proper spacing, and rounded corners.
- **Juz Amma flow**: Tapping Juz Amma shows a full-screen surah list overlay (surahs 78–114). Tapping a surah loads its verses. Back button returns to the list.
- **Lazy loading**: `JELAJAHI_BATCH_SIZE = 15`. First batch renders intro + 15 verse slides. More slides appended when user scrolls within 3 slides of the loaded end.
- **Progress bar**: Replaces pagination dots when `totalVerseCards > 16`. 4px teal bar with smooth width transition.
- **Intro card**: Static surah info (emoji, name, Arabic name, number, verse count, type) + Bismillah in gold. No typewriter (unlike curhat/panduan).
- **Verse cards**: No resonance/relevance text (no AI involved), just Arabic + translation + tafsir + asbabun nuzul + audio/share.
- **Node cloning on re-show**: `showJuzSurahList()` clones the container node to drop stale `animationend` listeners from a prior `hideJuzSurahList()` that may not have fired (view switched away mid-animation).

### Ajarkan Anakku mode
- **Hero + age toggle + gated content**: Blue gradient hero (`hero-ajarkan`), subtle "Berapa usia anak Anda?" instruction text with pulsing animation, iOS-style segmented toggle (`ak-age-seg`, `under7`/`7plus`). All content below (search input + categories) is hidden until age is selected, then fades in (`#ak-gated-content`, `ak-hidden` / `ak-gated-reveal`).
- **Category grid**: Single-column list of 6 categories (Aqidah 🤲, Ibadah 🕌, Akhlak 💎, Kehidupan & Takdir 🌿, Keluarga & Sosial 👥, Alam & Rasa Ingin Tahu 🌍). Horizontal layout: emoji left, label + count right. Blue-tinted background with left accent bar, hover lifts with shadow.
- **Category drill-down**: Tap category → full-screen expanded overlay (`#ajarkan-expanded`) with blue gradient header (`.ak-expanded-header`). Subcategories shown as tappable headers (sentence case, `.ak-subcategory-header`) — **collapsed by default**, tap to expand. Question rows (`.ak-question-row`) use blue hover theme (not teal).
- **Filter input**: Search input above the category grid — filters across all 325 questions, shows flat matching list with subcategory pill badges. Styled empty state with icon when no matches.
- **Result cards**: 3 card types built by `buildAjarkanPenjelasanCard()`, `buildAjarkanNgobrolCard()`, `buildAjarkanAktivitasCard()`. Wired by `wireAjarkanCardEvents()`.
  - **Card 0 (Penjelasan)**: Age badge with "↔ Ganti kategori umur", question title, penjelasan text (instant fade-in, no typewriter), collapsible verse mini-cards (tap-to-expand rows revealing dark Arabic section + gold accent bar + translation + action buttons). Bottom CTA: "Cara ngobrol dengan anak".
  - **Card 1 (Cara Ngobrol)**: Segmented toggle to pick between ❓ Pertanyaan or 📖 Cerita approach — only one panel shown at a time. Each panel has pembuka text, panduan, and expandable "Lihat penjelasan untuk anak". Bottom CTA: "Coba lakukan bersama anak".
  - **Card 2 (Coba Lakukan)**: Clean activity box only (blue gradient bg, left accent bar). No expandables, no cross-references.
- **Age switching from results**: Age badge in results is tappable → re-fetches same question with different age_group.
- **Color palette**: `--ak-blue: #4A7FB5` family (distinct warm blue, separate from teal and gold).

### Verse carousel (shared by all modes)
- Horizontal swipeable carousel (`#verses-carousel`) with CSS scroll-snap
- Intro slide (card 0): curhat/panduan shows typewriter reflection/explanation; jelajahi shows static surah info + Bismillah; ajarkan shows Penjelasan card with instant fade-in
- Verse slides (1–N): each contains one verse card built by `buildVerseCard()`
- Pagination dots (≤16 cards) or progress bar (>16 cards) + counter arrows in `.verses-header`
- Actions/feedback appear on reaching last card

### Verse card bottom section
Each verse card has three elements below the translation + resonance text:
- **Tafsir CTA**: Subtle tinted row — "📖 Pahami ayat ini lebih dalam →" (`.tafsir-cta-link`). Tapping opens the tafsir overlay (`openTafsirOverlay`). Only shown for verses with `tafsir_summary`; others fall back to collapsible accordions.
- **Action row** (`.vc-action-row`): Two equal-width side-by-side outline buttons:
  - **Dengarkan** (`.vc-audio-btn`): Play icon + "Dengarkan". Toggles to teal highlighted "Jeda" while playing (`.playing` class).
  - **Bagikan Ayat** (`.vc-share-btn`): "Bagikan Ayat" + inline IG and WA SVG icons. Opens the share sheet.
- Icon constants: `PLAY_ICON`, `PAUSE_ICON`, `WA_ICON`, `IG_ICON`, `CHEVRON_RIGHT` defined near top of card-building code.

### Share feature
- **Bottom sheet**: Opens `#share-sheet` with overlay (`#share-overlay`). Slides up with 300ms animation. Dismissible by: (1) overlay tap, (2) X close button in header, (3) swipe-down gesture.
- **Swipe-down dismiss**: Touch handlers on `#share-sheet` track drag distance. `touchmove` uses `{ passive: false }` + `e.preventDefault()` to block browser pull-to-refresh. Threshold: 80px drag = dismiss. Only activates when `sheet.scrollTop === 0`.
- **X close button**: `#share-sheet-close` in `.share-sheet-header`, positioned absolute top-right next to the drag handle.
- **Two-step flow**: Panel A (mode select) → Panel B-Image or Panel B-Text.
  - **Panel A** (`#sharePanelA`): Two card buttons — 🖼️ Gambar ("Bagikan sebagai foto") and 💬 Teks WA ("Pesan lengkap dengan konteks").
  - **Panel B-Image** (`#sharePanelImage`): Existing image share flow (unchanged), with back button to Panel A.
  - **Panel B-Text** (`#sharePanelText`): Text share config with toggles, preview bubble, and send/copy buttons. Back button to Panel A.
- **Panel B-Image details**:
  - **Live preview**: Full uncropped preview (`.share-preview`, ~60% width) in a `.share-preview-wrap` with "Pratinjau" label. Updates in real-time when theme or toggles change. NOT canvas-rendered — uses the same `.si-wrap` / `.si-theme-*` classes at reduced font sizes. Shows complete translation (no truncation) + "TemuQuran.com" footer branding.
  - **3 themes**: Light (#FFFFFF bg), Dark (#1A1D2E deep navy), Classic (#F5EFE0 parchment). Theme picker is horizontal pill buttons. Theme colors defined as `.si-theme-light`, `.si-theme-dark`, `.si-theme-classic` CSS classes.
  - **Content toggles**: "Sertakan pertanyaan" (curhat/panduan only, hidden in jelajahi/ajarkan) and "Sertakan tafsir" (all modes). Both unchecked by default.
  - **Platform buttons**: 2×2 grid — IG Story (1080×1920), WA Status (1080×1920), WA Chat (1080×1080), Download (1080×1080). Preview aspect ratio changes when story platforms selected.
  - **Image generation**: `buildShareElement()` creates an off-screen div in `#share-render`, styled per theme. `html2canvas` renders at `scale: 2` for crisp output. Branding footer "TemuQuran.com" on every image.
  - **Share flow**: Web Share API (`navigator.share({files})`) if supported, fallback to download. In-app browsers (Instagram/Facebook/TikTok/LINE) show toast warning.
  - **In-app browser detection**: `IS_IN_APP_BROWSER` flag set from user-agent regex at startup.
- **Panel B-Text details**:
  - **iOS-style toggles**: Feeling/Topic (mode-aware), Arabic, Translation, Reference, Reflection (hidden for ajarkan), Tafsir (hidden for ajarkan). Arabic + translation enforced: can't both be off.
  - **Tafsir sub-radio**: When tafsir toggle ON, shows ringkasan/lengkap radio. "Ibnu Katsir Lengkap" shows length warning note.
  - **Preview bubble**: Live-updating preview with bottom fade (`.share-preview-bubble`). Shows composed text via `composeShareText()`.
  - **Compose format**: Feeling header → `─────` divider → Arabic + curly-quoted translation + reference → divider → Refleksi + Tafsir (blank line between) → divider → "Ayat dan penjelasan dari TemuQuran.com". Dividers have breathing room (empty lines before/after). Section labels plain text (no emojis).
  - **Share prefs**: Stored in `localStorage.share_prefs`, persists across sessions. Default: feeling ON, arabic ON, translation ON, reference ON, reflection OFF, tafsir OFF.
  - **"📤 Bagikan" button**: Uses `navigator.share({ text })` (native OS share picker, same as image share). Falls back to clipboard copy if Web Share API unavailable.
  - **"📋 Salin" button**: Copies composed text to clipboard via `navigator.clipboard.writeText()`, shows toast.

### Tafsir overlay
- **Overlay**: Full-screen overlay (`openTafsirOverlay(verse)`) with tafsir summary, asbabun nuzul, and "Baca Tafsir Lengkap" accordion.
- **Sticky verse reference**: Expandable bar at top showing surah name + ayah number. Collapses to a compact sticky header when scrolled past. Tap to expand/collapse. Shows Arabic text + translation when expanded. Uses `position: sticky; top: 0; z-index: 10;` within the overlay's scrollable container.
- **Tafsir lengkap accordion**: Three sources — Kemenag, Ibnu Katsir (ID), Ibnu Katsir (EN). All start **collapsed** (user sees source options before choosing). Each source is a `.tfl-toggle` / `.tfl-answer` pair using `max-height` transition for smooth expand/collapse.

### Other features
- **Loading state**: `.ls-step-wrap` bounces continuously; `.ls-step-text` cycles through 4 mode-specific Indonesian messages every 1.8s. Jelajahi uses surah-focused loading steps ("Membuka surah…", "Menyiapkan ayat-ayat…") with `color: var(--text-mid)` override (`.jelajahi-loading .ls-step-text`) since the background is white. Ajarkan uses 🌙 icon and centered spinner (like jelajahi).
- **Swipe hint sequence** (curhat/panduan/jelajahi): Progressive 3-tier discoverability after verse results load:
  1. **Teal pill** (`.swipe-hint-pill`): "Geser untuk menemukan ayat →" with bouncing arrow animation (`@keyframes hintArrowBounce`). Shown immediately.
  2. **Peek nudge** (1.5s): carousel scrolls 50px right then snaps back, showing a physical preview of the next card.
  3. **Auto-advance** (5s): carousel auto-scrolls to card 2 if user hasn't swiped yet.
  - Timers stored in `_swipeHintTimers`; `clearSwipeHints()` cancels all timers and fades the pill (`.hint-faded` class) on first user swipe.
- **Typewriter**: reflection/explanation text types at 3 chars / 15 ms on intro slide (curhat/panduan only). Jelajahi and Ajarkan intros are static (no typewriter — Ajarkan uses instant fade-in).
- **A2HS (Add to Home Screen)**: Install card (`#a2hsCard`) below VOTD on landing — "Jadikan TemuQuran aplikasi di HP" + "Pasang" button.
  - **Android**: Captures `beforeinstallprompt` event → fires native install prompt on tap.
  - **iOS**: Opens a visual step-by-step guide overlay (`.a2hs-guide-overlay`) with 4 numbered steps matching Safari's actual flow (⋯ → Share → scroll to "Tambahkan ke Layar Utama" → "Tambah"). Slides up from bottom, dismissible by "Mengerti" button or overlay tap.
  - Events: `a2hs_tapped`, `a2hs_installed`.
- **QRIS support (Dukung TemuQuran)**: In the About overlay's "Dukung" FAQ accordion — shows inline QRIS image (`qris.png`) + "Simpan QRIS" download button. Download uses blob-based approach (`URL.createObjectURL`) for reliable mobile saving (iOS Safari `<a download>` is unreliable), falls back to `window.open`. Event: `qris_saved`.
- **Verse of the Day**: collapsed by default (tap to expand) on landing-view. Loaded from `/api/verse-of-day`, silently hidden on failure.
- **html2canvas**: lazy-loaded (~200 KB) only on first share tap. Used by the share sheet image generation.
- **Audio**: Alafasy recitation via `cdn.islamic.network`, global ayah number computed from `SURAH_VERSE_COUNTS` cumulative sum. Auto-paused on carousel swipe.
- **OG image**: `og-image.png` (1200×630) + `og-image.html` template in project root. Clean design: "Temukan dalam Al-Qur'an" headline, teal divider, 3 mode indicators, "TemuQuran.com" branding.

---

## Infrastructure & billing
| Service | Plan | Key limits | Status (Mar 2026) |
|---|---|---|---|
| **Vercel** | Hobby (free) | 100 GB bandwidth, 1M edge requests, 1M function invocations | All metrics < 3% |
| **Supabase** | Free | 500 MB database, 5 GB egress, 50K MAU | DB: 270 MB / 500 MB (54%), egress < 5% |
| **OpenAI** | Pay-as-you-go | — | ~$0.01–0.03 per curhat/panduan search, ~$0.0001 per jelajahi typed query |
| **Domain** | temuquran.com via Namecheap | — | — |

---

## CSS conventions
- CSS custom properties defined in `:root` in `style.css` — use these, don't hardcode colours
- Key vars: `--gold`, `--gold-light`, `--teal-dark`, `--text-dark`, `--text-mid`, `--text-muted`, `--border`, `--radius`, `--radius-sm`, `--shadow-card`
- Emotion cards (curhat): uniform blue — `#EEF3FB` bg, `#C8D8F0` border, `#6B8DD6` accent bar
- Panduan cards: teal accent — `#EDF7F6` bg, `#B8DDD9` border, `var(--teal-dark)` accent bar
- Jelajahi cards: light border — `var(--border)` border, no accent bar, hover lift
- Ajarkan cards: blue accent — `--ak-blue` family (`#4A7FB5`), 4px gradient accent bar (`::before`), `--ak-blue-bg` (#EFF5FB), `--ak-blue-border` (#D4E2F0)
- Jelajahi intro card: dark gradient bg (`#0A0F1E` → `#0A5C7A`), gold Bismillah (`.ji-bismillah`)
- Reading progress bar: `var(--border)` track, `var(--teal-dark)` fill, 4px height
- No CSS framework, no preprocessor, no build step — split into 12 files in `css/` folder
- JS split into 13 files in `js/` folder — loaded via `<script defer>` in order (data → core → features → init)

---

## Security

### Headers (`vercel.json`)
All routes serve these security headers:
| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com; connect-src 'self' https://cdn.islamic.network https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com https://*.analytics.google.com; media-src https://cdn.islamic.network; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | Vercel adds automatically (`max-age=63072000`) |

### CORS
API endpoints (`get-ayat.js`, `log-event.js`) restrict `Access-Control-Allow-Origin` to `https://temuquran.com` only. Requests from other origins receive no ACAO header. `Vary: Origin` is set for proper caching. `nuri.js` uses rate limiting (20/hr/IP) but no explicit CORS restriction (same-origin fetch only).

### Redirect
`quran-feelings.vercel.app/*` → **308 permanent redirect** → `temuquran.com/*` (configured in `vercel.json` redirects).

### Error messages
API error responses never expose raw OpenAI/Supabase error details. Internal errors are logged with `console.error()` server-side; the client always receives a generic Indonesian error message.

### XSS protection
- `escapeHtml()` function (uses `div.textContent` → `div.innerHTML` trick) — used for all user input AND all DB content (arabic, translation, ref, tafsir) before `innerHTML` insertion. Also used in `formatNuriMessage()` for Nuri verse blocks.
- `renderMarkdown()` has its own inline escape (for tafsir markdown content).
- Typewriter effect uses `textContent` (safe).

### Secrets
- `.env` is in `.gitignore` and has **never** been committed to git history.
- All API keys use `process.env.*` — server-side only in Vercel serverless functions.
- Minimal npm dependencies (`openai`, `@supabase/supabase-js`, `web-push`) — server-side only, no client-side bundles.

---

## Common gotchas
- **No build step** — edit files directly, push to deploy. No `npm run build`. CSS in `css/`, JS in `js/`, loaded via plain `<link>` and `<script defer>` tags in `index.html`.
- **Vercel cold starts** — `get-ayat.js` and `nuri.js` both have `maxDuration: 30s`. The AI pipeline takes 3–8 s warm. Nuri follow-up exchanges may hit cold-start 500s (FUNCTION_INVOCATION_FAILED) — frontend auto-retries once silently.
- **In-memory cache/rate-limit reset on deploy** — each new deploy spins a fresh container.
- **SUPABASE_ANON_KEY** is the Legacy anon key (from Supabase Dashboard → Settings → API → Legacy Keys). Not the service key.
- **Embedding model** — stored vectors and query vectors both use `text-embedding-3-large` at `dimensions: 1536`. Don't change the model or dimensions without re-running the embedding script on all DB rows.
- **`verse_saved` / `verse_unsaved` events** remain in the analytics allowlist even though the bookmark feature was removed (harmless, just never fire).
- **Bismillah stripping** — uses NFC Unicode normalization because DB diacritics ordering differs from hardcoded constant. Only applies in Jelajahi mode.
- **Juz surah list animation** — `showJuzSurahList()` clones the container node to prevent stale `animationend` handlers from re-hiding the list after a view switch interrupts the hide animation.
- **Jelajahi lazy loading** — triggers 3 slides before the loaded boundary for smooth UX. `jelajahiAllVerses` holds the full array; slides are appended in batches of 15.
- **Share sheet close** — `closeShareSheet()` must reset inline `transform` and `transition` styles set by the swipe-down drag gesture before removing the `visible` class. Also resets to Panel A (`showSharePanelA()`) for next open.
- **Share image themes** — `.si-theme-*` classes in `style.css` define colors for the off-screen share render element AND the live preview. Both share the same class hierarchy (`si-wrap`, `si-arabic`, `si-translation`, `si-ref`, `si-tafsir`, `si-footer`).
- **OG meta tags** — title is "TemuQuran — Temukan dalam Al-Qur'an", description mentions all 3 modes + privacy + no ads. Theme color is `#2A7C6F` (teal).
- **Filename case sensitivity** — Vercel deploys on Linux (case-sensitive). `qris.png` ≠ `QRIS.png`. Always use lowercase filenames.
- **CSP changes** — if you add a new CDN script or connect to a new external API from the frontend, update the CSP in `vercel.json` or the browser will block it. GA4 required additions to `script-src`, `img-src`, and `connect-src`.
- **CORS changes** — if you add a new custom domain or need localhost dev access, update the `allowedOrigin` in both `api/get-ayat.js` and `api/log-event.js`.

---

## Future feature ideas (discussed, not yet built)
Priority order agreed with owner:
1. **Bookmark / Save Ayat** — ❤️ button on verse cards, localStorage-based "Tersimpan" collection. No account needed. `verse_saved`/`verse_unsaved` events already in analytics allowlist.
2. **Streak counter** — Day counter ("Hari ke-N kamu merenung ✨"). Track `last_visit_date` + streak count in localStorage. Pairs with existing push notifications.
3. **Reflection history / Journal** — Timeline of past feelings + verses received, stored in localStorage. "3 hari lalu kamu merasa *sedih*..."
4. **Share deeplinks** — `temuquran.com/?s=2:255` opens exact verse with context. URL param infrastructure already exists.

## Nuri — Belajar Bareng Nuri (Mode 5)

### View
`nuri-view` — full-screen chat UI. Entry: tap `.nuri-card` or `#nuriStartBtn` on landing page → `startNuriSession()`.

### API (`api/nuri.js`)
- **Method**: POST
- **Model**: `gpt-4o-mini` with `response_format: { type: 'json_object' }`
- **Returns**: `{ nuri_response_formatted, nuri_response_raw, conversation_mode, verses[], tafsir_context, quick_replies[] }`
- **Rate limit**: 60 requests / IP / hour (in-memory)
- **maxDuration**: 30s (in `vercel.json`)
- **max_tokens**: 400
- **Dependencies**: `openai` npm package (in `package.json`)
- **Guided learning**: Accepts `guided_state` in request body. `buildGuidedPromptAddendum(gs)` appends mode-specific system prompt. Verse pre-fetching: when guided, looks up verse tafsir and injects into prompt context.
- **Quick replies**: GPT returns `quick_replies` field in JSON, sliced to max 4 items

### Multi-verse placeholder system
GPT is instructed NEVER to write Arabic, translations, or verse references directly in text.
GPT places `{VERSE_1}` (and optionally `{VERSE_2}`) in its response text, with a `verse_refs` array in the JSON.

**Backend pipeline** (per verse ref):
1. `lookupVerse(surah, ayah)` — queries `quran_verses` for arabic, translation, surah_name, + `tafsir_quraish_shihab`
2. If lookup fails → `semanticFallback(query)` — embeds query via `text-embedding-3-large`, calls `match_verses_hybrid` RPC, enriches top result with tafsir
3. Replaces `{VERSE_1}` in **formatted** response with: `{ARABIC}...{/ARABIC}\n{TRANSLATION}...{/TRANSLATION}\n{REF}...{/REF}`
4. Replaces `{VERSE_1}` in **raw** response with: `[Surah Name : Ayah] "translation text"` (plain text for conversation history)

**Safety nets**:
- If GPT returns `verse_refs: []` (violating prompt rules), backend does a semantic fallback lookup and appends `{VERSE_1}` at the end of the response automatically
- Backward compatibility: also handles legacy `{VERSE_PLACEHOLDER}` format
- Unreplaced placeholders are cleaned from both formatted and raw text

**Frontend** (`formatNuriMessage()` in `app.js`):
- Converts `{ARABIC}...{/ARABIC}` → `<span class="nuri-verse-arabic">`
- Converts `{TRANSLATION}...{/TRANSLATION}` → `<span class="nuri-verse-translation">`
- Converts `{REF}...{/REF}` → `<span class="nuri-verse-ref">`
- All DB content passed through `escapeHtml()` before `innerHTML` injection (XSS prevention)

**NEVER change this 3-layer pattern without updating API → app.js → style.css.**

### Tafsir grounding
`lookupVerse()` fetches `tafsir_quraish_shihab` alongside verse data. `buildTafsirContext()` assembles tafsir snippets for all resolved verses. Returned as `tafsir_context` in the API response (for future use — not currently sent back to GPT in-conversation, but grounds verse selection accuracy via the FTS index which includes all tafsir columns).

### Conversation history
- `nuri_response_raw` stores **plain-text** verse references: `[Al-Baqarah : 153] "Hai orang-orang yang beriman..."` — never `{VERSE_PLACEHOLDER}` or HTML markers
- This ensures GPT sees clean, readable context on follow-up exchanges
- Context window: last `NURI_CONFIG.contextWindow * 2` messages (user + assistant pairs)

### Auto-retry & error handling
**Frontend auto-retry** (`_sendNuriMessageInternal` in `app.js`):
- On first fetch failure (non-200 or `data.error`), silently retries **once** before showing error to user
- Handles Vercel cold-start `FUNCTION_INVOCATION_FAILED` (500) transparently — user rarely sees errors
- Checks `res.ok` before parsing JSON (prevents crash on HTML error pages)

**Manual retry button**:
- On error after auto-retry exhausted: shows "Maaf, ada kendala teknis. Coba lagi ya 🙏" + "Coba lagi 🔄" button
- `appendNuriRetryButton()` creates `.nuri-retry-row` with `.nuri-retry-btn`
- `retryNuriMessage()` calls `_sendNuriMessageInternal(text, true)` — `isRetry=true` skips user bubble append and message history push (prevents duplicates)
- Clicking retry removes the error bubble and retry button before re-sending
- `nuriLastFailedMessage` state variable tracks the last failed message text

### Opening experience
- 3 variants in `startNuriSession()`: first-time (warm intro + 3 buttons), returning with active curriculum (progress card + 4 buttons), returning without (greeting + 4 buttons)
- `getNuriOpeningMessage()` — seasonal: Friday greeting (`getDay()===5`), Ramadan date range check
- Opening is **client-side only** — no API call
- 4 modes: Pahami Surah/Ayat, Mulai Perjalanan Belajar (9 curricula), Pilih Tema (50 paths), Tanya Langsung (free chat)

### System prompt design
- **Character**: Warm, wise friend — not ustaz, not chatbot. Casual Indonesian, occasionally playful.
- **Response structure**: Acknowledge → context/insight → verse(s) via placeholder → connect to life → natural closing
- **Verse rules**: SELALU (always) include ≥1 verse. Only exception: user clarifying a previously mentioned verse.
- **Format**: JSON with `nuri_response`, `verse_refs[]`, `conversation_mode`
- **Closing**: Flexible — can be question, warm statement, or reflection prompt (not forced question every time)
- **Mode detection**: First exchange only — `deep_dive` (specific surah/ayat) vs `exploration` (theme/topic/feeling)
- **Word limit**: 150 words max per response, `max_tokens: 400`
- **Quick replies**: GPT returns `quick_replies` JSON field; free chat includes upsell to guided modes

### State (session-scoped)
```
nuriMessages[]         — full conversation history (plain text verse refs in assistant messages)
nuriOptedIn            — boolean, default false
nuriSessionId          — uuid generated at session start
nuriExchangeCount      — increments per successful exchange
nuriConversationMode   — 'deep_dive' | 'exploration' | null
nuriIsTyping           — prevents double-sends
nuriLastFailedMessage  — text of last failed message (for retry)
nuriGuidedState        — { type, curriculum_id, path_index, path_id, lesson, total_lessons, total_paths, verse_ref, lesson_title, path_title }
nuriCurriculaCache     — cached /api/curricula response
```

### Cost controls
```
maxExchanges: 20       — hard session limit for free chat (40 for guided modes)
contextWindow: 8       — last 8 exchanges sent to API (×2 for user+assistant pairs)
max_tokens: 400        — set in GPT API call
```

### UI components
- **Chat bubbles**: User messages (teal, right-aligned), Nuri messages (light bg, left-aligned with avatar)
- **Typing indicator**: "Nuri sedang mengetik..." with animated dots
- **Verse blocks (free chat)**: Arabic (right-aligned, large font) + italic translation + teal reference. Uses `{ARABIC}...{/ARABIC}` markers via `formatNuriMessage()`
- **Verse card (guided lessons)**: Collapsible dark gradient card (`.nuri-vc`). Collapsed: gold "QS. {ref}" + "Ketuk untuk baca ayat" hint + chevron. Expanded: Arabic text (white, Amiri, RTL) + italic translation + "Dengarkan" audio button. Toggle via `data-action="toggleNuriVc"`. Audio via `data-action="nuriVcPlayAudio"` with `e.stopPropagation()`. Animation: `max-height: 0 → 600px` (0.35s ease). Needs `flex-shrink: 0` because `.nuri-messages` is a flex column.
- **Quick replies**: Teal outline chips (`.nuri-qr-chip`) in CSS Grid container (`.nuri-quick-replies`). 2-col default, `.single-col` variant. **Never use flexbox** — `flex-basis` applies to height in column direction, breaking layout.
- **Curriculum progress card**: Inline card with emoji, title, progress bar. Rendered by `renderCurriculumProgressCard()`
- **Retry button**: `.nuri-retry-btn` — outline style, border-radius 20px, teal accent, hover lifts
- **Session end**: `.nuri-session-end` message when `maxExchanges` reached
- **Opt-in card**: "Bantu Nuri berkembang" with checkbox, shown after opening message

### DB tables (opt-in only)
```
nuri_sessions          — full conversation JSON, only when opted_in = true
nuri_feedback          — thumbs up/down per exchange, only when opted_in = true
```

### MVP scope
Dewasa mode ONLY. Do not build kids mode.

---

## Learning Paths (Perjalanan Belajar)

### Database
- **`learning_paths`** (50 rows) — path metadata: id, title, description, type (situation/topic), verse refs
- **`lessons`** (250 rows) — 5 lessons per path, each with verse_ref, verse texts, title
- **`curricula`** (9 rows) — curated sequences of paths, RLS enabled with public read
- 16 surah name corrections applied to seed SQL before inserting

### API endpoints
- `GET /api/learning-paths` — list all paths grouped by type (Cache-Control: 1hr CDN)
- `GET /api/learning-paths/[pathId]` — path detail + lessons (Cache-Control: 1hr CDN)
- `GET /api/learning-paths/suggest` — verse overlap matching
- `POST /api/learning-paths/lesson/[lessonId]/generate` — GPT lesson generation (handles 429 rate limit)
- `GET /api/curricula` — returns 9 curricula with path details, lesson counts (Cache-Control: 1hr CDN)

### Frontend screens
- `paths-list-view` — tabbed list (Situasi / Tema), path cards with shadow-based styling
- `path-preview-view` — dark hero gradient header + lesson list with progress indicators
- `lesson-view` — dark Arabic section (`.lp-verse-dark`) + white explanation/reflection sections
- `path-complete-view` — completion screen with next path suggestions

### Key patterns
- **Lesson ID**: `${pathId}-${orderNum}` (e.g., `mencari-makna-hidup-1`)
- **Lesson cache**: in-memory `lpLessonCache` + `lpPreloadAllLessons()` fire-and-forget on path start
- **Progress**: localStorage key `nuri-progress`
- **Dark gradient**: `linear-gradient(135deg, #0A0F1E 0%, #0F2044 70%, #0D3B6E 100%)` — used in verse sections and Nuri verse card
- **Cards**: Shadow-based (`var(--shadow-rest)`) not border-based. Radius `var(--radius)` (20px).
- **Audio on dark bg**: Outlined style (transparent bg, white border), gold when playing
- **Scoped `.hidden`**: NOT a global rule. Each component needs its own: `.lp-tab-panel.hidden`, etc.
- **Event delegation**: Single `document.addEventListener('click')` via `data-action` attributes
- **XSS**: All GPT output wrapped in `escapeHtml()` before innerHTML

---

## Nuri Guided Learning

### Quick-Reply System
- `renderQuickReplies(replies, containerEl)` — renders teal outline chips in CSS Grid (2-col default, `.single-col` variant)
- `handleQuickReplyTap(btn, container)` — marks selected, disables siblings, routes to action handler
- `handleQuickReplyAction(action, btn)` — central switch (~20 actions)
- Quick replies: API-generated (from GPT `quick_replies` field) + client-generated (standard lesson navigation)
- **CSS Grid only** — never flexbox. `.nuri-quick-replies` uses `grid-template-columns: 1fr 1fr` / `1fr`

### Guided State
- **Single source of truth**: `nuriGuidedState` object — `{ type, curriculum_id, path_index, path_id, lesson, total_lessons, total_paths, verse_ref, lesson_title, path_title }`
- **3 guided types**: `guided_verse`, `guided_theme`, `guided_curriculum`
- **Exchange limit**: 40 for guided modes (vs 20 free chat)
- **API integration**: `guided_state` sent in request body, `buildGuidedPromptAddendum(gs)` appends mode-specific system prompt

### Curriculum Flow (Deterministic, No GPT)
- `CURRICULUM_RECOMMENDATIONS` map — deterministic branching based on user's self-assessment
- `NEXT_CURRICULUM` map — suggests next curriculum after completion
- `startCurriculumRecommendation()` → branching → `recommendCurriculum()` → `startCurriculum(curriculumId)`
- `showAllCurricula()` — fetches `/api/curricula`, groups by audience, renders as quick-reply buttons
- `fetchCurriculaData()` — fetches + caches in `nuriCurriculaCache`

### Guided Lessons
- `enterGuidedLesson()` — fetches lesson via `lpGetLessonContent()`, sets `nuriGuidedState`, renders collapsible verse card (`appendNuriVerseCard()`), sends to Nuri API for explanation
- `advanceToNextLesson()` / `advanceToNextPath()` — manages lesson/path transitions within curriculum
- `handlePathComplete()` / `handleCurriculumComplete()` — completion flows with next curriculum suggestions
- **Reflection pacing**: L1=personal, L2=none, L3=understanding check, L4=none, L5=closing (references L1)

### Nuri Verse Card (`.nuri-vc`)
- `appendNuriVerseCard({ arabicText, translation, verseRef, surah, ayah })` — dark gradient card in chat
- **Collapsed**: Gold "QS. {ref}" + "Ketuk untuk baca ayat" + chevron
- **Expanded**: White Arabic (Amiri, RTL) + italic translation + "Dengarkan" audio button
- **Toggle**: `data-action="toggleNuriVc"` — `.open` class + `aria-expanded`
- **Audio**: `data-action="nuriVcPlayAudio"` — `e.stopPropagation()` + `playAudio()`
- **Animation**: `max-height: 0 → 600px` with `transition: 0.35s ease`
- **Flex fix**: Needs `flex-shrink: 0` because `.nuri-messages` is `display: flex; flex-direction: column`
- **Scope**: Guided modes only. Free chat still uses `{ARABIC}...{/ARABIC}` markers via `formatNuriMessage()`

### Journal View
- HTML: `#journal-view` section with `journal-header` + `journal-content`
- `showJournalView()` — reads `tq-journal` localStorage, renders entries
- Each entry has `data-action="journalPlay"` / `"journalShare"` buttons
- Back button returns to `nuri-view`

### localStorage Keys (Guided Learning)
```
tq-nuri-onboarded           — 'true' | absent (controls first-time vs returning)
tq-curriculum-progress      — { currId: { current_path_index, current_lesson, started_at, paths_completed[] } }
tq-reflection-log           — { pathId: [{ lesson, verse, reflection, date }] }
tq-journal                  — [{ verse_ref, nuri_explanation, user_reflection, nuri_response, date, path, lesson }]
```
