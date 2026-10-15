create table if not exists stripe_events (
  id text primary key,
  type text not null,
  session_id text,
  received_at timestamptz not null default now()
);

create table if not exists lumen_passes (
  session_id text primary key,
  plan_id text not null,
  paid_until_ms bigint not null,
  status text not null,
  payment_intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lumen_passes_payment_intent_idx
  on lumen_passes (payment_intent);

create table if not exists stripe_config (
  id integer primary key check (id = 1),
  webhook_endpoint_id text,
  webhook_secret text,
  webhook_url text,
  updated_at timestamptz not null default now()
);
