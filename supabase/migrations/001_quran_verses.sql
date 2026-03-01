-- ─────────────────────────────────────────────────────────────────────────────
-- Run these blocks IN ORDER in the Supabase SQL Editor
-- (Project → SQL Editor → New query → paste → Run)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Enable pgvector extension ─────────────────────────────────────────────
create extension if not exists vector;


-- ── 2. Create verses table ───────────────────────────────────────────────────
create table if not exists quran_verses (
  id             text    primary key,   -- e.g. "2:255"
  surah_number   integer not null,
  surah_name     text    not null,      -- e.g. "Al-Baqarah"
  verse_number   integer not null,
  arabic         text    not null,
  translation    text    not null,      -- Indonesian (id.indonesian edition)
  tafsir_summary text,                  -- hand-written; null for uncurated verses
  embedding      vector(1536) not null
);


-- ── 3. Row Level Security (read-only with anon key) ───────────────────────────
alter table quran_verses enable row level security;

create policy "Allow anonymous read"
  on quran_verses
  for select
  using (true);


-- ── 4. Similarity-search RPC function ─────────────────────────────────────────
-- Called from the Vercel serverless function using the anon key.
create or replace function match_verses(
  query_embedding  vector(1536),
  match_count      integer default 15
)
returns table (
  id             text,
  surah_name     text,
  verse_number   integer,
  arabic         text,
  translation    text,
  tafsir_summary text,
  similarity     float
)
language sql stable
as $$
  select
    id,
    surah_name,
    verse_number,
    arabic,
    translation,
    tafsir_summary,
    1 - (embedding <=> query_embedding) as similarity
  from quran_verses
  order by embedding <=> query_embedding
  limit match_count;
$$;


-- ── 5. Vector index ───────────────────────────────────────────────────────────
-- !! Run this block AFTER the seed script finishes inserting all 6,236 rows !!
-- (Indexes built on populated tables are faster and more accurate)
--
-- create index on quran_verses
--   using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);
