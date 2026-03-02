-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Hybrid Search (vector + BM25 full-text + RRF merge)
-- Run these blocks IN ORDER in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add FTS generated column ───────────────────────────────────────────────
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

-- ── 2. GIN index ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS quran_verses_fts_idx
ON quran_verses USING GIN(fts);

-- ── 3. Hybrid RPC (v4 — final, timeout-safe) ─────────────────────────────────
-- Fix history:
--   v1: ROW_NUMBER OVER (ORDER BY embedding <=>) → prevents HNSW → full scan
--   v2: split vector_hits/vector_ranked → fixed HNSW
--       but fts_hits used ORDER BY ts_rank → slow for common words
--   v3: removed ORDER BY ts_rank
--       but plainto_tsquery AND-semantics → ~1 match estimated for colloquial
--       words → planner chose slow seq scan over large tsvectors (2-4s)
--   v4 (current): FTS switched to OR semantics via regexp_replace.
--       plainto_tsquery 'capek & lelah & hari' → 'capek | lelah | hari'
--       Planner now estimates many matches → fast early-stopping scan (72ms)
--       After ALL IK tafsir translations: run REINDEX + VACUUM ANALYZE to
--       refresh statistics for both HNSW and GIN indexes.
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
  vector_hits AS (
    SELECT id
    FROM quran_verses
    ORDER BY embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  vector_ranked AS (
    SELECT id, ROW_NUMBER() OVER () AS rank_v
    FROM vector_hits
  ),

  -- ── B: FTS scan — OR semantics so planner estimates many matches ──────────
  -- plainto_tsquery gives AND: rare colloquial words → ~1 row estimate
  --   → planner picks slow seq scan on large tsvectors (2-4 seconds)
  -- Converting & → | gives OR: common terms like 'hari','ini' → 6k rows
  --   → planner stops early at LIMIT 40 (72ms)
  fts_hits AS (
    SELECT id
    FROM quran_verses
    WHERE fts @@ to_tsquery('simple',
      regexp_replace(
        plainto_tsquery('simple', query_text)::text,
        ' & ', ' | ', 'g'
      )
    )
    LIMIT match_count * 2
  ),
  fts_ranked AS (
    SELECT id, ROW_NUMBER() OVER () AS rank_f
    FROM fts_hits
  ),

  -- ── C: RRF merge ──────────────────────────────────────────────────────────
  rrf AS (
    SELECT
      COALESCE(v.id, f.id) AS id,
      COALESCE(1.0 / (60.0 + v.rank_v), 0.0) +
      COALESCE(1.0 / (60.0 + f.rank_f), 0.0) AS rrf_score
    FROM vector_ranked  v
    FULL OUTER JOIN fts_ranked f ON v.id = f.id
  )

  SELECT
    qv.id, qv.surah_number, qv.surah_name, qv.verse_number,
    qv.arabic, qv.translation, qv.tafsir_summary,
    r.rrf_score AS similarity
  FROM rrf r
  JOIN quran_verses qv ON qv.id = r.id
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
$$;


-- ── 4. Post-mass-update maintenance (run after bulk data changes) ─────────────
-- After bulk-updating embedding or tafsir columns, statistics go stale.
-- Run these to restore index health and query planner accuracy:
--
--   REINDEX INDEX quran_verses_embedding_idx;  -- rebuild HNSW after reembed
--   REINDEX INDEX quran_verses_fts_idx;        -- rebuild GIN after IK updates
--   VACUUM ANALYZE quran_verses;               -- refresh all statistics
