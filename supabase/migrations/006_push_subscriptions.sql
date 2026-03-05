create table push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  notify_hour      smallint not null,
  notify_tz_offset integer not null default 0,
  created_at       timestamptz default now()
);

create index idx_push_subscriptions_notify_hour
  on push_subscriptions (notify_hour);
