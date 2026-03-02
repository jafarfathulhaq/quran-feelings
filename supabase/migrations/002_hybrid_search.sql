-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Hybrid Search (vector + BM25 full-text + RRF merge)
-- Run these blocks IN ORDER in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add FTS generated column ───────────────────────────────────────────────
-- Automatically maintained on every INSERT/UPDATE.
-- Covers translation + both tafsirs for maximum Indonesian keyword recall.
-- 'simple' config: lowercases, no stemming (correct for Indonesian).
ALTER TABLE quran_verses
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple',
    coalesce(translation,           '') || ' ' ||
    coalesce(tafsir_summary,        '') || ' ' ||
    coalesce(tafsir_kemenag,        '') || ' ' ||
    coalesce(tafsir_ibnu_kathir_id, '')
  )
) STORED;


-- ── 2. GIN index for fast FTS queries ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS quran_verses_fts_idx
ON quran_verses USING GIN(fts);


-- ── 3. Hybrid RPC (v3 — timeout-safe) ────────────────────────────────────────
-- History of fixes:
--   v1 (original): ROW_NUMBER OVER (ORDER BY embedding <=>) inside CTE
--      → prevents HNSW index use → full table scan → timeout
--   v2: split into vector_hits (HNSW) + vector_ranked (ROW_NUMBER on small set)
--      → fixed HNSW, but FTS still used ORDER BY ts_rank → slow for common words
--   v3 (current): also remove ORDER BY ts_rank from fts_hits
--      → ts_rank computes for ALL matching rows before LIMIT on common words
--      → GIN scan order is sufficient for RRF (approximate rank is fine)
DROP FUNCTION IF EXISTS match_verses_hybrid(vector, text, integer);

CREATE FUNCTION match_verses_hybrid(
  query_embedding  vector(1536),
  query_text       text,
  match_count      integer DEFAULT 20
)
RETURNS TABLE (
  id             text,
  surah_number   integer,
  surah_name     text,
  verse_number   integer,
  arabic         text,
  translation    text,
  tafsir_summary text,
  similarity     float
)
LANGUAGE sql STABLE
AS $$
  WITH

  -- ── A: HNSW index scan (plain ORDER BY + LIMIT — index-safe) ─────────────
  -- Must NOT use ROW_NUMBER here — that prevents HNSW index usage.
  vector_hits AS (
    SELECT id
    FROM quran_verses
    ORDER BY embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  -- Assign ranks AFTER the LIMIT — trivially fast on the small result set.
  vector_ranked AS (
    SELECT id, ROW_NUMBER() OVER () AS rank_v
    FROM vector_hits
  ),

  -- ── B: GIN index scan — NO ORDER BY ts_rank ──────────────────────────────
  -- ORDER BY ts_rank forces PostgreSQL to compute ts_rank for ALL matching
  -- rows before LIMIT is applied. For common Indonesian words (capek, sakit,
  -- ibu) this can be thousands of rows — causing statement timeouts.
  -- GIN scan order (posting list order) is a good-enough approximation for
  -- RRF since the vector side provides the primary semantic ranking.
  fts_hits AS (
    SELECT id
    FROM quran_verses
    WHERE fts @@ plainto_tsquery('simple', query_text)
    LIMIT match_count * 2
  ),
  fts_ranked AS (
    SELECT id, ROW_NUMBER() OVER () AS rank_f
    FROM fts_hits
  ),

  -- ── C: Reciprocal Rank Fusion (RRF) ──────────────────────────────────────
  -- score = 1/(k + rank_v) + 1/(k + rank_f),  k=60 (Cormack et al. 2009)
  -- FULL OUTER JOIN: verse absent from one list still benefits from the other.
  rrf AS (
    SELECT
      COALESCE(v.id, f.id) AS id,
      COALESCE(1.0 / (60.0 + v.rank_v), 0.0) +
      COALESCE(1.0 / (60.0 + f.rank_f), 0.0) AS rrf_score
    FROM vector_ranked  v
    FULL OUTER JOIN fts_ranked f ON v.id = f.id
  )

  -- ── D: Enrich and return ordered by RRF score ─────────────────────────────
  SELECT
    qv.id,
    qv.surah_number,
    qv.surah_name,
    qv.verse_number,
    qv.arabic,
    qv.translation,
    qv.tafsir_summary,
    r.rrf_score AS similarity
  FROM rrf r
  JOIN quran_verses qv ON qv.id = r.id
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
$$;
