-- =========================================================
-- Lucky Draw Live — Supabase schema
-- Run this in the Supabase SQL editor for a fresh project.
-- =========================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------
-- Draw sessions: one row per event run
-- ---------------------------------------------------------
create table if not exists draw_sessions (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Live Draw',
  total_participants integer not null default 0,
  total_winners integer not null default 0,
  status text not null default 'idle', -- idle | running | paused | completed
  is_live boolean not null default false, -- the project shown on the public /draw screen
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Participants
-- ---------------------------------------------------------
create table if not exists participants (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references draw_sessions(id) on delete cascade,
  name text not null,
  division text not null,
  phone text not null default '', -- admin-only; never shown on the public screen
  status text not null default 'pending', -- pending | won
  created_at timestamptz not null default now(),
  unique (session_id, name, division, phone)
);

create index if not exists idx_participants_session_status
  on participants(session_id, status);

-- ---------------------------------------------------------
-- Gifts
-- ---------------------------------------------------------
create table if not exists gifts (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references draw_sessions(id) on delete cascade,
  gift_name text not null,
  total_quantity integer not null default 0,
  remaining_quantity integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_gifts_session on gifts(session_id);

-- ---------------------------------------------------------
-- Winners
-- ---------------------------------------------------------
create table if not exists winners (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references draw_sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete set null,
  name text not null,
  division text not null,
  gift text not null,
  serial integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_winners_session on winners(session_id);

-- ---------------------------------------------------------
-- Row Level Security
-- Public (anon) can only READ data needed for the live draw
-- screen (winners + session status). All writes go through
-- server-side API routes using the service role key, which
-- bypasses RLS — the anon key can never mutate data directly.
-- ---------------------------------------------------------
alter table draw_sessions enable row level security;
alter table participants enable row level security;
alter table gifts enable row level security;
alter table winners enable row level security;

drop policy if exists "public read sessions" on draw_sessions;
create policy "public read sessions" on draw_sessions
  for select using (true);

drop policy if exists "public read winners" on winners;
create policy "public read winners" on winners
  for select using (true);

-- Participants and gifts are NOT publicly readable (names before
-- they win, and inventory, stay admin-only). No select policy is
-- created for anon on these two tables, so RLS denies by default.
