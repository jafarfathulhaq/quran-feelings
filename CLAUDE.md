# CLAUDE.md — quran-feelings

## Project overview
**Curhat & Temukan Ayat** — a privacy-first web app where users describe how they feel and receive relevant Qur'anic verses. No user text is ever stored.

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
index.html          — single-page shell (two views: selection-view, verses-view)
style.css           — all styles, no framework
app.js              — all frontend JS, no framework, no build
api/
  get-ayat.js       — main AI pipeline (rate-limit → HyDE → embed → vector search → GPT select)
  log-event.js      — privacy-safe analytics proxy (event allowlist, no user text)
  verse-of-day.js   — serves a daily verse from data/verses.json, cached by day
data/verses.json    — curated verses for Verse of the Day feature
supabase/migrations/
  001_quran_verses.sql   — quran_verses table + pgvector column
  002_hybrid_search.sql  — match_verses_hybrid RPC (vector + full-text hybrid search)
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

1. **Decompose** (`gpt-4o-mini`) — splits multi-issue input into up to 3 distinct spiritual needs
2. **HyDE × 3** (`gpt-4o-mini`) — generates hypothetical Qur'anic descriptions (emotional / situational / divine-hope angles, or one per need for multi-intent)
3. **Embed × 3** (`text-embedding-3-large`, 1536 dims) — embeds the three HyDE texts
4. **Hybrid search × 3** (Supabase `match_verses_hybrid` RPC) — 20 results per angle, round-robin merged, deduped, surah-diversity filtered → top 25 candidates
5. **Select** (`gpt-4o`) — picks 1–3 verses from candidates, writes `reflection` + `verse_resonance` per verse
6. **Tafsir fetch** (Supabase REST) — fetches `tafsir_kemenag`, `tafsir_ibnu_kathir`, `tafsir_ibnu_kathir_id` for the selected verses only

**Cache**: in-memory per container, 24h TTL, 500 entries max (FIFO eviction). `refresh: true` in POST body bypasses lookup but still writes result.
**Rate limit**: 20 requests / IP / hour, in-memory. Returns `resetAt` timestamp → frontend shows exact minutes.

---

## Analytics (`api/log-event.js`)
Fire-and-forget from `app.js`. **Never logs user text.** Each event includes `session_id` (random per tab, `sessionStorage`).

Valid event types:
`search_started`, `search_completed`, `search_cached`, `mood_feedback`,
`verse_saved`, `verse_unsaved`, `verse_shared`, `verse_played`, `tafsir_opened`, `tafsir_tab`

To query analytics:
```sql
-- Supabase SQL editor or REST API with service key
SELECT event_type, count(*) FROM analytics_events
WHERE created_at > now() - interval '7 days'
GROUP BY event_type ORDER BY count DESC;
```

---

## Frontend architecture (`app.js`)
- **Two views**: `selection-view` (home) and `verses-view` (results). `switchView(id)` swaps the `.active` class.
- **Emotion cards**: 13 preset emotions → fire `fetchAyat()` with a fixed feeling string
- **Loading state**: `.ls-step-wrap` bounces continuously; `.ls-step-text` cycles through 4 Indonesian messages every 1.8 s with a fade-in slide animation
- **Typewriter**: reflection text types at 3 chars / 15 ms; verse cards stagger in at 150 ms each
- **Verse of the Day**: collapsed by default (tap to expand). Loaded from `/api/verse-of-day`, silently hidden on failure.
- **html2canvas**: lazy-loaded (~200 KB) only on first "Bagikan" tap
- **Audio**: Alafasy recitation via `cdn.islamic.network`, global ayah number computed from `SURAH_VERSE_COUNTS` cumulative sum

---

## CSS conventions
- CSS custom properties defined in `:root` in `style.css` — use these, don't hardcode colours
- Key vars: `--gold`, `--gold-light`, `--teal-dark`, `--text-dark`, `--text-mid`, `--text-muted`, `--border`, `--radius`, `--radius-sm`, `--shadow-card`
- Emotion cards: uniform blue — `#EEF3FB` bg, `#C8D8F0` border, `#6B8DD6` accent bar
- No CSS framework, no preprocessor

---

## Common gotchas
- **No build step** — edit files directly, push to deploy. No `npm run build`.
- **Vercel cold starts** — `get-ayat.js` has `maxDuration: 30s`; the AI pipeline takes 3–8 s warm.
- **In-memory cache/rate-limit reset on deploy** — each new deploy spins a fresh container.
- **SUPABASE_ANON_KEY** is the Legacy anon key (from Supabase Dashboard → Settings → API → Legacy Keys). Not the service key.
- **Embedding model** — stored vectors and query vectors both use `text-embedding-3-large` at `dimensions: 1536`. Don't change the model or dimensions without re-running the embedding script on all DB rows.
- **`verse_saved` / `verse_unsaved` events** remain in the analytics allowlist even though the bookmark feature was removed (harmless, just never fire).
