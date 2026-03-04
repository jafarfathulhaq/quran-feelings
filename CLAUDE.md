# CLAUDE.md — TemuQuran

## Project overview
**TemuQuran** — a privacy-first web app with three modes: (1) **Curhat** — users describe feelings and receive emotionally resonant Qur'anic verses, (2) **Panduan Hidup** — users ask life-guidance questions and receive topically relevant Qur'anic verses with scholarly explanations, (3) **Jelajahi Al-Qur'an** — users browse and read Quran verses by surah, juz, or natural language query (no AI needed for presets). No user text is ever stored.

- **Live URL**: https://temuquran.com (custom domain on Vercel, DNS via Namecheap)
- **Legacy URL**: https://quran-feelings.vercel.app (redirects to temuquran.com)
- **Deploy**: `git push origin main` → auto-deploys on Vercel (no build step)
- **Preview**: Use the live Vercel URL in Chrome. `preview_start` won't work — macOS sandbox blocks serving from `~/Documents`.

---

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (`index.html`, `style.css`, `app.js`) |
| Backend | Vercel Serverless Functions (`api/*.js`, Node 20) |
| Database | Supabase (PostgreSQL + pgvector) |
| AI | OpenAI — `gpt-4o-mini` (verse selection, HyDE, decompose, jelajahi intent parser), `text-embedding-3-large` (1536 dims) |
| Analytics | Supabase `analytics_events` table via `/api/log-event` |
| PWA | `manifest.json` + `sw.js` |

---

## Key files
```
index.html          — single-page shell (5 views: landing-view, selection-view, panduan-view, jelajahi-view, verses-view)
style.css           — all styles, no framework
app.js              — all frontend JS, no framework, no build
api/
  get-ayat.js       — main AI pipeline (rate-limit → HyDE → embed → vector search → GPT select), mode-aware (curhat/panduan/jelajahi)
  log-event.js      — privacy-safe analytics proxy (event allowlist, no user text)
  verse-of-day.js   — serves a daily verse from data/verses.json, cached by day
data/verses.json    — curated verses for Verse of the Day feature
supabase/migrations/
  001_quran_verses.sql   — quran_verses table + pgvector column
  002_hybrid_search.sql  — match_verses_hybrid RPC (vector + full-text hybrid search)
  003_asbabun_nuzul.sql  — adds asbabun_nuzul + asbabun_nuzul_id columns
scripts/
  seed_asbabun_nuzul.py      — fetches English asbabun nuzul from spa5k/tafsir_api (Al-Wahidi)
  translate_asbabun_nuzul.py  — translates to Indonesian via OpenAI Batch API
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

**Mode**: POST body accepts `mode` (`'curhat'` default, `'panduan'`, `'jelajahi'`). Mode forks prompts at steps 1, 2, and 5.
**Cache**: in-memory per container, 24h TTL, 500 entries max (FIFO eviction). Cache key prefixed with `mode:`. `refresh: true` bypasses lookup but still writes result.
**Rate limit**: 20 requests / IP / hour, in-memory. Returns `resetAt` timestamp → frontend shows exact minutes.

### Jelajahi mode
Completely different pipeline — no vector search, no GPT-4o verse selection:

- **Preset taps**: bypass AI entirely. Frontend sends `intent` object (e.g. `{ type: 'surah', surah: 112 }`). API queries Supabase REST directly for the matching verses. Zero OpenAI cost, no rate limit.
- **Typed queries**: parsed by `gpt-4o-mini` intent parser (~$0.0001/call) into structured JSON intent (`{ type: 'surah'|'ayat'|'ayat_range'|'juz', surah, ayah_start, ayah_end, juz }`). Then same direct DB query.
- **Cache**: 7-day TTL for jelajahi (vs 24h for curhat/panduan).
- **Rate limit**: Presets exempt. Typed queries count toward the normal rate limit.
- **Juz type**: Returns `{ type: 'surah_list' }` response — frontend shows surah list overlay instead of verses.

---

## Analytics (`api/log-event.js`)
Fire-and-forget from `app.js`. **Never logs user text.** Each event includes `session_id` (random per tab, `sessionStorage`).

Valid event types:
`mode_selected`, `search_started`, `search_completed`, `search_cached`, `mood_feedback`,
`verse_saved`, `verse_unsaved`, `verse_shared`, `verse_played`, `tafsir_opened`, `tafsir_tab`,
`asbabun_nuzul_opened`, `card_expanded`, `sub_question_selected`, `tulis_sendiri_opened`, `verse_swiped`,
`jelajahi_search`, `jelajahi_juz_surah_selected`, `jelajahi_surah_browser`, `jelajahi_juz_group_opened`, `jelajahi_multi_selected`,
`share_sheet_opened`, `share_theme_selected`, `share_completed`,
`tafsir_summary_opened`, `tafsir_summary_swiped`, `tafsir_full_opened`, `tafsir_full_tab_switched`, `tafsir_overlay_closed`,
`a2hs_tapped`, `a2hs_installed`, `about_opened`, `about_faq_tapped`, `qris_saved`

To query analytics:
```sql
-- Supabase SQL editor or REST API with service key
SELECT event_type, count(*) FROM analytics_events
WHERE created_at > now() - interval '7 days'
GROUP BY event_type ORDER BY count DESC;
```

---

## Frontend architecture (`app.js`)

### Views & navigation
- **Five views**: `landing-view` → `selection-view` (curhat) / `panduan-view` (panduan) / `jelajahi-view` (jelajahi) → `verses-view` (results). `switchView(id)` swaps the `.active` class.
- **Landing**: 3 mode cards (Curhat, Panduan Hidup, Jelajahi Al-Qur'an) + VOTD section below a divider
- **Back navigation stack**:
  - Curhat: verses → selection-view → landing
  - Panduan: verses → expanded card (if came from sub-question) → panduan grid → landing
  - Jelajahi: verses → juz surah list (if came from Juz Amma) → jelajahi presets → landing

### State variables
- `currentMode` (`'curhat'`, `'panduan'`, or `'jelajahi'`)
- `expandedCardId` — active panduan sub-question card ID, or null
- `currentCardIndex` / `totalVerseCards` — carousel position and total slides
- `jelajahiAllVerses` — full verse array for lazy loading
- `jelajahiLoadedUpTo` — how many verses have been rendered as slides
- `jelajahiSurahInfo` — surah metadata for the intro card
- `juzSurahListVisible` — whether the juz surah list overlay is showing
- `lastJuzSurahTapped` — surah number if user came from juz list (for back nav)
- `shareTheme` / `shareIncludeQuestion` / `shareIncludeTafsir` / `shareActiveVerse` / `shareLastPlatform` — share sheet state

### Key data constants
- `SURAH_META` — 114 entries with `{ number, name, name_arabic, verses, type }` (~5KB)
- `SURAH_BROWSER` — 10 Juz groups (flat array), each `{ label, surahs: [numbers] }`. Groups: Juz 1–5, 6–10, 11–15, 16–20, 21–25, 26, 27, 28, 29, 30
- `JUZ_30_SURAHS` — filtered subset of SURAH_META (surahs 78–114)
- `PANDUAN_SUB_QUESTIONS` — 10 categories × 8 sub-questions
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

### Verse carousel (shared by all modes)
- Horizontal swipeable carousel (`#verses-carousel`) with CSS scroll-snap
- Intro slide (card 0): curhat/panduan shows typewriter reflection/explanation; jelajahi shows static surah info + Bismillah
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
- **Live preview**: CSS-styled preview thumbnail (~60% width) updates in real-time when theme or toggles change. NOT canvas-rendered — uses the same `.si-wrap` / `.si-theme-*` classes at reduced font sizes.
- **3 themes**: Light (#FFFFFF bg), Dark (#1A1D2E deep navy), Classic (#F5EFE0 parchment). Theme picker is horizontal pill buttons. Theme colors defined as `.si-theme-light`, `.si-theme-dark`, `.si-theme-classic` CSS classes.
- **Content toggles**: "Sertakan pertanyaan" (curhat/panduan only, hidden in jelajahi) and "Sertakan tafsir" (all modes). Both unchecked by default.
- **Platform buttons**: 2×2 grid — IG Story (1080×1920), WA Status (1080×1920), WA Chat (1080×1080), Download (1080×1080). Preview aspect ratio changes when story platforms selected.
- **Image generation**: `buildShareElement()` creates an off-screen div in `#share-render`, styled per theme. `html2canvas` renders at `scale: 2` for crisp output. Branding footer "TemuQuran.com" on every image.
- **Share flow**: Web Share API (`navigator.share({files})`) if supported, fallback to download. In-app browsers (Instagram/Facebook/TikTok/LINE) show toast warning.
- **In-app browser detection**: `IS_IN_APP_BROWSER` flag set from user-agent regex at startup.

### Tafsir overlay
- **Overlay**: Full-screen overlay (`openTafsirOverlay(verse)`) with tafsir summary, asbabun nuzul, and "Baca Tafsir Lengkap" accordion.
- **Sticky verse reference**: Expandable bar at top showing surah name + ayah number. Collapses to a compact sticky header when scrolled past. Tap to expand/collapse. Shows Arabic text + translation when expanded. Uses `position: sticky; top: 0; z-index: 10;` within the overlay's scrollable container.
- **Tafsir lengkap accordion**: Three sources — Kemenag, Ibnu Katsir (ID), Ibnu Katsir (EN). All start **collapsed** (user sees source options before choosing). Each source is a `.tfl-toggle` / `.tfl-answer` pair using `max-height` transition for smooth expand/collapse.

### Other features
- **Loading state**: `.ls-step-wrap` bounces continuously; `.ls-step-text` cycles through 4 mode-specific Indonesian messages every 1.8s. Jelajahi uses a simpler spinner.
- **Typewriter**: reflection/explanation text types at 3 chars / 15 ms on intro slide; "Geser untuk mulai →" hint after completion (curhat/panduan only)
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
- Jelajahi intro card: dark gradient bg (`#0A0F1E` → `#0A5C7A`), gold Bismillah (`.ji-bismillah`)
- Reading progress bar: `var(--border)` track, `var(--teal-dark)` fill, 4px height
- No CSS framework, no preprocessor

---

## Security

### Headers (`vercel.json`)
All routes serve these security headers:
| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cdn.islamic.network; media-src https://cdn.islamic.network; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | Vercel adds automatically (`max-age=63072000`) |

### CORS
Both API endpoints (`get-ayat.js`, `log-event.js`) restrict `Access-Control-Allow-Origin` to `https://temuquran.com` only. Requests from other origins receive no ACAO header. `Vary: Origin` is set for proper caching.

### Redirect
`quran-feelings.vercel.app/*` → **308 permanent redirect** → `temuquran.com/*` (configured in `vercel.json` redirects).

### Error messages
API error responses never expose raw OpenAI/Supabase error details. Internal errors are logged with `console.error()` server-side; the client always receives a generic Indonesian error message.

### XSS protection
- `escapeHtml()` function escapes `& < > "` — used for all user input AND all DB content (arabic, translation, ref, tafsir) before `innerHTML` insertion.
- `renderMarkdown()` has its own inline escape (for tafsir markdown content).
- Typewriter effect uses `textContent` (safe).

### Secrets
- `.env` is in `.gitignore` and has **never** been committed to git history.
- All API keys use `process.env.*` — server-side only in Vercel serverless functions.
- Zero npm dependencies — no supply chain risk.

---

## Common gotchas
- **No build step** — edit files directly, push to deploy. No `npm run build`.
- **Vercel cold starts** — `get-ayat.js` has `maxDuration: 30s`; the AI pipeline takes 3–8 s warm.
- **In-memory cache/rate-limit reset on deploy** — each new deploy spins a fresh container.
- **SUPABASE_ANON_KEY** is the Legacy anon key (from Supabase Dashboard → Settings → API → Legacy Keys). Not the service key.
- **Embedding model** — stored vectors and query vectors both use `text-embedding-3-large` at `dimensions: 1536`. Don't change the model or dimensions without re-running the embedding script on all DB rows.
- **`verse_saved` / `verse_unsaved` events** remain in the analytics allowlist even though the bookmark feature was removed (harmless, just never fire).
- **Bismillah stripping** — uses NFC Unicode normalization because DB diacritics ordering differs from hardcoded constant. Only applies in Jelajahi mode.
- **Juz surah list animation** — `showJuzSurahList()` clones the container node to prevent stale `animationend` handlers from re-hiding the list after a view switch interrupts the hide animation.
- **Jelajahi lazy loading** — triggers 3 slides before the loaded boundary for smooth UX. `jelajahiAllVerses` holds the full array; slides are appended in batches of 15.
- **Share sheet close** — `closeShareSheet()` must reset inline `transform` and `transition` styles set by the swipe-down drag gesture before removing the `visible` class.
- **Share image themes** — `.si-theme-*` classes in `style.css` define colors for the off-screen share render element AND the live preview. Both share the same class hierarchy (`si-wrap`, `si-arabic`, `si-translation`, `si-ref`, `si-tafsir`, `si-footer`).
- **OG meta tags** — title is "TemuQuran — Temukan dalam Al-Qur'an", description mentions all 3 modes + privacy + no ads. Theme color is `#2A7C6F` (teal).
- **CSP changes** — if you add a new CDN script or connect to a new external API from the frontend, update the CSP in `vercel.json` or the browser will block it.
- **CORS changes** — if you add a new custom domain or need localhost dev access, update the `allowedOrigin` in both `api/get-ayat.js` and `api/log-event.js`.
