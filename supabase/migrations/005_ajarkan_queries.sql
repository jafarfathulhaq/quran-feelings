-- Ajarkan Anakku — pre-generated parent-child Q&A content
-- Each question has two rows (one per age group) sharing the same selected_verses.

CREATE TABLE IF NOT EXISTS ajarkan_queries (
  id                  SERIAL PRIMARY KEY,
  question_id         TEXT NOT NULL,           -- e.g. 'sholat-02', 'siapa-allah-01'
  question_text       TEXT NOT NULL,           -- "Kenapa kita harus sholat?"
  category            TEXT NOT NULL,           -- 'aqidah', 'ibadah', etc.
  subcategory         TEXT NOT NULL,           -- 'sholat', 'siapa-allah', etc.
  age_group           TEXT NOT NULL CHECK (age_group IN ('under7', '7plus')),
  selected_verses     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Array of: { "surah": 29, "ayah": 45, "verse_relevance": "..." }
  penjelasan_anak     TEXT NOT NULL,
  pembuka_percakapan  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Object: { "pertanyaan": "...", "panduan_pertanyaan": "...", "cerita": "...", "panduan_cerita": "..." }
  aktivitas_bersama   TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ajarkan_question_age UNIQUE (question_id, age_group)
);

-- Fast lookups by question + age (most common runtime query)
CREATE INDEX idx_ajarkan_question_age ON ajarkan_queries (question_id, age_group);

-- Category browsing
CREATE INDEX idx_ajarkan_category ON ajarkan_queries (category, subcategory);

-- RLS: read-only for anon key
ALTER TABLE ajarkan_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read ajarkan"
  ON ajarkan_queries FOR SELECT USING (true);
