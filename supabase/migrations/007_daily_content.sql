-- Daily Card — pre-generated daily content for the 5-slide landing card.
-- One row per day. Cron generates at 00:05 WIB (17:05 UTC).

CREATE TABLE IF NOT EXISTS daily_content (
  id                    SERIAL PRIMARY KEY,
  content_date          DATE NOT NULL UNIQUE,

  -- Slide 2: Curhat (feeling-based verse)
  feeling               TEXT NOT NULL,            -- e.g. 'Aku merasa sangat sedih dan patah hati'
  feeling_label         TEXT NOT NULL,            -- e.g. 'Sedih'
  feeling_emoji         TEXT NOT NULL,            -- e.g. '🌧️'
  feeling_verse         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { id, surah_name, verse_number, arabic, translation, ref,
  --   tafsir_kemenag, tafsir_ibnu_kathir_id, tafsir_quraish_shihab,
  --   reflection, resonance }

  -- Slide 3: Panduan (topic-based verse)
  topic                 TEXT NOT NULL,            -- e.g. 'Rezeki'
  topic_query           TEXT NOT NULL,            -- e.g. 'Saya mencari panduan tentang rezeki halal...'
  topic_emoji           TEXT NOT NULL,            -- e.g. '💰'
  topic_verse           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { id, surah_name, verse_number, arabic, translation, ref,
  --   tafsir_kemenag, tafsir_ibnu_kathir_id, tafsir_quraish_shihab,
  --   explanation, relevance }

  -- Slide 4: Jelajahi (surah of the day)
  surah_number          SMALLINT NOT NULL,        -- 1-114
  surah_name            TEXT NOT NULL,            -- e.g. 'Al-Kahf'
  surah_name_arabic     TEXT NOT NULL,            -- e.g. 'الكهف'
  surah_verse_count     SMALLINT NOT NULL,        -- e.g. 110
  surah_type            TEXT NOT NULL,            -- 'Makkiyyah' or 'Madaniyyah'

  -- Slide 5: Ajarkan (child question of the day)
  ajarkan_question_id   TEXT NOT NULL,            -- e.g. 'siapa-allah-01'
  ajarkan_question_text TEXT NOT NULL,            -- e.g. 'Siapa itu Allah?'
  ajarkan_category      TEXT NOT NULL,            -- e.g. 'Aqidah'
  ajarkan_category_emoji TEXT NOT NULL,           -- e.g. '🤲'

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by date (most common runtime query)
CREATE INDEX idx_daily_content_date ON daily_content (content_date DESC);

-- RLS: anonymous SELECT, service-key INSERT
ALTER TABLE daily_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read daily_content"
  ON daily_content FOR SELECT USING (true);

CREATE POLICY "Allow service insert daily_content"
  ON daily_content FOR INSERT WITH CHECK (true);
