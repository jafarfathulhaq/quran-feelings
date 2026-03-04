-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Tafsir Summary JSONB + Column Rename
--
-- Renames the existing tafsir_summary TEXT column (Tafsir Muntakhab / Quraish
-- Shihab) to tafsir_quraish_shihab, then creates a new tafsir_summary JSONB
-- column for pre-generated AI summaries.
--
-- The FTS generated column references tafsir_summary, so we must drop and
-- re-create it with the new column name. Both RPCs are also updated.
--
-- Run this in the Supabase SQL Editor as a single transaction.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Drop FTS generated column (depends on tafsir_summary TEXT) ───────────
ALTER TABLE quran_verses DROP COLUMN IF EXISTS fts;
DROP INDEX IF EXISTS quran_verses_fts_idx;

-- ── 2. Rename tafsir_summary TEXT → tafsir_quraish_shihab ───────────────────
ALTER TABLE quran_verses RENAME COLUMN tafsir_summary TO tafsir_quraish_shihab;

-- ── 3. Add new tafsir_summary JSONB column ──────────────────────────────────
ALTER TABLE quran_verses ADD COLUMN tafsir_summary JSONB DEFAULT NULL;

-- ── 4. Re-create FTS generated column with new column name ──────────────────
ALTER TABLE quran_verses ADD COLUMN fts tsvector
GENERATED ALWAYS AS (
  to_tsvector('simple',
    coalesce(translation,              '') || ' ' ||
    coalesce(tafsir_quraish_shihab,    '') || ' ' ||
    coalesce(tafsir_kemenag,           '') || ' ' ||
    coalesce(tafsir_ibnu_kathir_id,    '')
  )
) STORED;

CREATE INDEX quran_verses_fts_idx
ON quran_verses USING GIN(fts);

-- ── 5. Partial index for fast "has summary?" checks ─────────────────────────
CREATE INDEX idx_quran_verses_has_summary
ON quran_verses ((tafsir_summary IS NOT NULL));

-- ── 6. Update match_verses RPC (from migration 001) ────────────────────────
DROP FUNCTION IF EXISTS match_verses(vector, integer);

CREATE FUNCTION match_verses(
  query_embedding  vector(1536),
  match_count      integer DEFAULT 15
)
RETURNS TABLE (
  id                     text,
  surah_name             text,
  verse_number           integer,
  arabic                 text,
  translation            text,
  tafsir_quraish_shihab  text,
  similarity             float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id, surah_name, verse_number, arabic, translation,
    tafsir_quraish_shihab,
    1 - (embedding <=> query_embedding) AS similarity
  FROM quran_verses
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 7. Update match_verses_hybrid RPC (from migration 002) ─────────────────
DROP FUNCTION IF EXISTS match_verses_hybrid(vector, text, integer);

CREATE FUNCTION match_verses_hybrid(
  query_embedding  vector(1536),
  query_text       text,
  match_count      integer DEFAULT 20
)
RETURNS TABLE (
  id                     text,
  surah_number           integer,
  surah_name             text,
  verse_number           integer,
  arabic                 text,
  translation            text,
  tafsir_quraish_shihab  text,
  similarity             float
)
LANGUAGE sql STABLE
AS $$
  WITH

  -- HNSW index scan
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

  -- FTS scan (OR semantics for fast early-stopping)
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

  -- RRF merge
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
    qv.arabic, qv.translation, qv.tafsir_quraish_shihab,
    r.rrf_score AS similarity
  FROM rrf r
  JOIN quran_verses qv ON qv.id = r.id
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
$$;

-- ── 8. Update update_tafsir_batch RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_tafsir_batch(updates jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE quran_verses AS qv
  SET tafsir_quraish_shihab = (u->>'tafsir_quraish_shihab')
  FROM jsonb_array_elements(updates) AS u
  WHERE qv.id = u->>'id';
END;
$$;

COMMIT;


-- ── Post-migration maintenance (run after COMMIT) ──────────────────────────
-- VACUUM ANALYZE quran_verses;
-- REINDEX INDEX quran_verses_fts_idx;
