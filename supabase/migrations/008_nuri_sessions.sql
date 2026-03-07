-- Nuri session storage (only for opted-in users)
create table if not exists nuri_sessions (
  id uuid primary key,
  created_at timestamptz default now(),
  mode text default 'dewasa',
  conversation_mode text,           -- 'deep_dive' | 'exploration'
  messages jsonb not null,
  exchange_count int default 0,
  flagged_for_training bool default false
);

create table if not exists nuri_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references nuri_sessions(id) on delete cascade,
  exchange_index int not null,
  signal text not null,             -- 'positive' | 'negative'
  created_at timestamptz default now()
);

-- Index for curation queries
create index if not exists nuri_sessions_flagged on nuri_sessions(flagged_for_training);
create index if not exists nuri_feedback_session on nuri_feedback(session_id, signal);
