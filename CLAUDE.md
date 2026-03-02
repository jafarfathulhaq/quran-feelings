# CLAUDE.md — quran-feelings

## Project overview
**Curhat & Temukan Ayat** — a privacy-first web app with two modes: (1) **Curhat** — users describe feelings and receive emotionally resonant Qur'anic verses, (2) **Panduan Hidup** — users ask life-guidance questions and receive topically relevant Qur'anic verses with scholarly explanations. No user text is ever stored.

- **Live URL**: https://quran-feelings.vercel.app
- **Deploy**: `git push origin main` → auto-deploys on Vercel (no build step)
- **Preview**: Use the live Vercel URL in Chrome. `preview_start` won't work — macOS sandbox blocks serving from `~/Documents`.

---

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (`index.html`, `style.css`, `app.js`) |
| Backend | Vercel Serverless Functions (`api/*.js`, Node 20) |
| Database | Supabase (PostgreSQL + pgvector) |
| AI | OpenAI — `gpt-4o` (verse selection), `gpt-4o-mini` (HyDE + decompose), `text-embedding-3-large` |
| Analytics | Supabase `analytics_events` table via `/api/log-event` |
| PWA | `manifest.json` + `sw.js` |

---

## Key files
```
index.html          — single-page shell (4 views: landing-view, selection-view, panduan-view, verses-view)
style.css           — all styles, no framework
app.js              — all frontend JS, no framework, no build
api/
  get-ayat.js       — main AI pipeline (rate-limit → HyDE → embed → vector search → GPT select), mode-aware (curhat/panduan)
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
vercel.json         — sets maxDuration: 30s for get-ayat.js
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
Each search makes **5–6 parallel AI calls** then one sequential GPT-4o call:

1. **Decompose** (`gpt-4o-mini`) — splits multi-issue input into up to 3 distinct needs (spiritual needs for curhat, topics for panduan)
2. **HyDE × 3** (`gpt-4o-mini`) — generates hypothetical Qur'anic descriptions. Curhat uses emotional / situational / divine-hope angles; Panduan uses topical / ethical / practical angles
3. **Embed × 3** (`text-embedding-3-large`, 1536 dims) — embeds the three HyDE texts
4. **Hybrid search × 3** (Supabase `match_verses_hybrid` RPC) — 20 results per angle, round-robin merged, deduped, surah-diversity filtered → top 25 candidates
5. **Select** (`gpt-4o`) — picks 3–7 verses (3–4 for focused queries, 5–7 for complex/multi-dimensional). Curhat writes `reflection` + `verse_resonance`; Panduan writes `explanation` + `verse_relevance`
6. **Tafsir fetch** (Supabase REST) — fetches `tafsir_kemenag`, `tafsir_ibnu_kathir`, `tafsir_ibnu_kathir_id` for the selected verses only

**Mode**: POST body accepts `mode` (`'curhat'` default, `'panduan'`). Mode forks prompts at steps 1, 2, and 5.
**Cache**: in-memory per container, 24h TTL, 500 entries max (FIFO eviction). Cache key prefixed with `mode:`. `refresh: true` bypasses lookup but still writes result.
**Rate limit**: 20 requests / IP / hour, in-memory. Returns `resetAt` timestamp → frontend shows exact minutes.

---

## Analytics (`api/log-event.js`)
Fire-and-forget from `app.js`. **Never logs user text.** Each event includes `session_id` (random per tab, `sessionStorage`).

Valid event types:
`mode_selected`, `search_started`, `search_completed`, `search_cached`, `mood_feedback`,
`verse_saved`, `verse_unsaved`, `verse_shared`, `verse_played`, `tafsir_opened`, `tafsir_tab`,
`asbabun_nuzul_opened`, `card_expanded`, `sub_question_selected`, `tulis_sendiri_opened`, `verse_swiped`

To query analytics:
```sql
-- Supabase SQL editor or REST API with service key
SELECT event_type, count(*) FROM analytics_events
WHERE created_at > now() - interval '7 days'
GROUP BY event_type ORDER BY count DESC;
```

---

## Frontend architecture (`app.js`)
- **Four views**: `landing-view` (mode selection) → `selection-view` (curhat) / `panduan-view` (panduan) → `verses-view` (results). `switchView(id)` swaps the `.active` class.
- **State**: `currentMode` (`'curhat'` or `'panduan'`), `expandedCardId` (active sub-question card or null), `currentCardIndex` / `totalVerseCards` (carousel position)
- **Landing carousel**: 2 swipeable cards with CSS scroll-snap, pagination dots update on scroll
- **Emotion cards**: 13 preset emotions → fire `fetchAyat()` with a fixed feeling string (curhat mode)
- **Panduan presets**: 10 preset topics → tap expands to sub-questions drill-down (`expandPanduanCard()`) with 8 sub-questions + "Tulis sendiri", teal accent cards
- **Sub-questions**: `PANDUAN_SUB_QUESTIONS` object (10 categories × 8 questions, keyed by hyphenated ID). Expanded view is a fixed-position overlay (`#panduan-expanded`). Back navigation: verses → expanded card → panduan grid → landing
- **Loading state**: `.ls-step-wrap` bounces continuously; `.ls-step-text` cycles through 4 mode-specific Indonesian messages every 1.8 s
- **Verse carousel**: horizontal swipeable carousel (`#verses-carousel`) with CSS scroll-snap. Intro slide (card 0) shows reflection/explanation with typewriter. Verse slides (1–N) each contain one verse card. Pagination dots + counter arrows in `.verses-header`. Actions/feedback appear on reaching last card
- **Typewriter**: reflection/explanation text types at 3 chars / 15 ms on intro slide; "Geser untuk mulai →" hint after completion
- **Verse of the Day**: collapsed by default (tap to expand) on landing-view. Loaded from `/api/verse-of-day`, silently hidden on failure.
- **html2canvas**: lazy-loaded (~200 KB) only on first "Bagikan" tap
- **Audio**: Alafasy recitation via `cdn.islamic.network`, global ayah number computed from `SURAH_VERSE_COUNTS` cumulative sum

---

## CSS conventions
- CSS custom properties defined in `:root` in `style.css` — use these, don't hardcode colours
- Key vars: `--gold`, `--gold-light`, `--teal-dark`, `--text-dark`, `--text-mid`, `--text-muted`, `--border`, `--radius`, `--radius-sm`, `--shadow-card`
- Emotion cards (curhat): uniform blue — `#EEF3FB` bg, `#C8D8F0` border, `#6B8DD6` accent bar
- Panduan cards: teal accent — `#EDF7F6` bg, `#B8DDD9` border, `var(--teal-dark)` accent bar
- No CSS framework, no preprocessor

---

## Common gotchas
- **No build step** — edit files directly, push to deploy. No `npm run build`.
- **Vercel cold starts** — `get-ayat.js` has `maxDuration: 30s`; the AI pipeline takes 3–8 s warm.
- **In-memory cache/rate-limit reset on deploy** — each new deploy spins a fresh container.
- **SUPABASE_ANON_KEY** is the Legacy anon key (from Supabase Dashboard → Settings → API → Legacy Keys). Not the service key.
- **Embedding model** — stored vectors and query vectors both use `text-embedding-3-large` at `dimensions: 1536`. Don't change the model or dimensions without re-running the embedding script on all DB rows.
- **`verse_saved` / `verse_unsaved` events** remain in the analytics allowlist even though the bookmark feature was removed (harmless, just never fire).
