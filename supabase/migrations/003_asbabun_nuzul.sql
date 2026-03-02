-- ─────────────────────────────────────────────────────────────────────────────
-- Add asbabun nuzul columns to quran_verses
-- Run in Supabase SQL Editor (Project → SQL Editor → New query → paste → Run)
-- ─────────────────────────────────────────────────────────────────────────────

-- asbabun_nuzul     = English text from Al-Wahidi (via spa5k/tafsir_api)
-- asbabun_nuzul_id  = Indonesian translation (via OpenAI gpt-4o-mini batch)
alter table quran_verses
  add column if not exists asbabun_nuzul    text,
  add column if not exists asbabun_nuzul_id text;
