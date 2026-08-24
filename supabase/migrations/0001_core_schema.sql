-- =====================================================================
-- SwanLake Football Stars — Shores & Scores Challenge
-- Migration 0001: core schema, indexes, RLS, realtime, storage
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type event_status        as enum ('draft','ready','live','completed','locked','archived');
  create type team_code           as enum ('A','B');
  create type challenge_mechanic  as enum ('mannequin_target','dribble_finish','long_range','center_circle','final_match');
  create type challenge_status    as enum ('draft','ready','locked','live','completed');
  create type round_status        as enum ('pending','ready','live','awaiting_result','result_ready','published','completed');
  create type match_status        as enum ('pending','ready','live','halftime','awaiting_result','result_ready','penalties','completed');
  create type entry_status        as enum ('confirmed','reversed');
  create type result_outcome      as enum ('A','B','draw');
  create type timer_mode          as enum ('count_up','count_down','stopwatch');
  create type timer_state         as enum ('ready','running','paused','ended');
  create type goal_points_mode    as enum ('team_share','scorer_only','scorer_plus_team');
  create type app_role            as enum ('super_admin','event_admin','scorekeeper','display_operator','viewer');
  create type ledger_entry_type   as enum (
    'attempt_points','round_win_bonus','round_draw_points','challenge_win_bonus',
    'match_goal_points','match_win_bonus','penalty_tiebreak_points','manual_adjustment'
  );
  create type display_scene       as enum (
    'holding','lineups','head_to_head','live_round','round_result',
    'challenge_result','final_match','leaderboard','ceremony'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Users / roles
-- ---------------------------------------------------------------------
create table if not exists app_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         app_role not null default 'viewer',
  created_at   timestamptz not null default now()
);

create or replace function public.current_app_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid();
$$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin','event_admin','scorekeeper') from app_users where id = auth.uid()),
    false);
$$;

create or replace function public.can_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin','event_admin') from app_users where id = auth.uid()),
    false);
$$;

create or replace function public.can_display()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin','event_admin','display_operator') from app_users where id = auth.uid()),
    false);
$$;

-- ---------------------------------------------------------------------
-- Event
-- ---------------------------------------------------------------------
create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  subtitle          text,
  venue             text,
  event_date        date,
  start_time        timestamptz,
  timezone          text not null default 'Africa/Cairo',
  status            event_status not null default 'draft',
  qr_target_url     text,
  holding_status    text not null default 'STARTING SOON',
  holding_headline  text,
  show_countdown    boolean not null default false,
  revision          bigint not null default 0,
  settings          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists teams (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  code            team_code not null,
  name            text not null,
  short_name      text,
  color           text not null default '#1E88C7',
  color_secondary text,
  crest_url       text,
  display_order   int not null default 0,
  unique (event_id, code)
);

create table if not exists players (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  team_id        uuid references teams(id) on delete set null,
  full_name      text not null,
  display_name   text,
  slug           text not null,
  jersey_number  int,
  photo_url      text,           -- transparent cutout, preferred
  portrait_url   text,           -- original portrait
  focal_x        numeric not null default 0.5,
  focal_y        numeric not null default 0.35,
  bio            text,
  active         boolean not null default true,
  display_order  int not null default 0,
  created_at     timestamptz not null default now(),
  unique (event_id, slug)
);
create index if not exists players_team_idx on players(team_id);

-- ---------------------------------------------------------------------
-- Scoring profile (single source of truth for every point value)
-- ---------------------------------------------------------------------
create table if not exists scoring_profiles (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  version    int  not null,
  config     jsonb not null,
  is_locked  boolean not null default false,
  locked_at  timestamptz,
  locked_by  uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, version)
);

-- ---------------------------------------------------------------------
-- Challenges / lineups / rounds
-- ---------------------------------------------------------------------
create table if not exists challenges (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  number           int not null check (number between 1 and 5),
  mechanic         challenge_mechanic not null,
  title            text not null,
  subtitle         text,
  description      text,
  status           challenge_status not null default 'draft',
  aggregation_rule text not null default 'total_points',
  round_count      int not null default 5,
  locked_at        timestamptz,
  completed_at     timestamptz,
  winner           result_outcome,
  unique (event_id, number)
);

create table if not exists lineup_slots (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  team_code    team_code not null,
  slot_index   int not null check (slot_index between 1 and 5),
  slot_label   text not null,               -- 'A1'..'A5' / 'B1'..'B5', kept in sync by trigger
  player_id    uuid references players(id) on delete set null,
  unique (challenge_id, team_code, slot_index)
);

create or replace function public.set_slot_label()
returns trigger language plpgsql as $$
begin
  new.slot_label := new.team_code::text || new.slot_index::text;
  return new;
end $$;

drop trigger if exists lineup_slots_label on lineup_slots;
create trigger lineup_slots_label before insert or update of team_code, slot_index
  on lineup_slots for each row execute function public.set_slot_label();
-- a player may occupy only one slot per challenge
create unique index if not exists lineup_slots_unique_player
  on lineup_slots(challenge_id, player_id) where player_id is not null;

create table if not exists rounds (
  id             uuid primary key default gen_random_uuid(),
  challenge_id   uuid not null references challenges(id) on delete cascade,
  number         int not null check (number between 1 and 5),
  status         round_status not null default 'pending',
  player_a_id    uuid references players(id) on delete set null,
  player_b_id    uuid references players(id) on delete set null,
  score_a        numeric not null default 0,
  score_b        numeric not null default 0,
  winner         result_outcome,
  active_side    team_code,          -- whose turn it is (turn-based mechanics)
  published_at   timestamptz,
  completed_at   timestamptz,
  revision       bigint not null default 0,
  unique (challenge_id, number)
);

-- Every scoring action inside a 1v1 round is one attempt row.
--  mannequin_target : payload {"target": 10|30|50|null}          3 per player
--  dribble_finish   : payload {"time_ms": int, "scored": bool}   3 per player
--  long_range       : payload {"zone": "green"|"blue"|"red30"|"red20"|null} 3 per player
--  center_circle    : payload {"hit": bool}                      10 per player
create table if not exists attempts (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references rounds(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  side           team_code not null,
  attempt_number int not null check (attempt_number between 1 and 10),
  payload        jsonb not null default '{}'::jsonb,
  points         numeric not null default 0,
  status         entry_status not null default 'confirmed',
  reverses_id    uuid references attempts(id),
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create unique index if not exists attempts_unique_confirmed
  on attempts(round_id, player_id, attempt_number) where status = 'confirmed';
create index if not exists attempts_round_idx on attempts(round_id);

-- ---------------------------------------------------------------------
-- Final 5v5 match
-- ---------------------------------------------------------------------
create table if not exists matches (
  id               uuid primary key default gen_random_uuid(),
  challenge_id     uuid not null unique references challenges(id) on delete cascade,
  status           match_status not null default 'pending',
  score_a          int not null default 0,
  score_b          int not null default 0,
  penalty_score_a  int not null default 0,
  penalty_score_b  int not null default 0,
  goal_points_mode goal_points_mode not null default 'team_share',
  current_half     int not null default 1,
  winner           result_outcome,
  published_at     timestamptz,
  completed_at     timestamptz,
  revision         bigint not null default 0
);

create table if not exists goals (
  id                   uuid primary key default gen_random_uuid(),
  match_id             uuid not null references matches(id) on delete cascade,
  team_code            team_code not null,          -- team credited with the goal
  scorer_id            uuid references players(id) on delete set null,
  is_own_goal          boolean not null default false,
  own_goal_by_player_id uuid references players(id) on delete set null,
  method               text not null default 'open_play',  -- open_play | penalty_in_play | free_kick | header | own_goal
  clock_ms             bigint not null default 0,
  half                 int not null default 1,
  status               entry_status not null default 'confirmed',
  reverses_id          uuid references goals(id),
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now()
);
create index if not exists goals_match_idx on goals(match_id, status);

create table if not exists penalty_shootouts (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null unique references matches(id) on delete cascade,
  status           text not null default 'open',    -- open | sudden_death | completed
  opening_attempts int not null default 3,
  winner           result_outcome,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists penalty_attempts (
  id              uuid primary key default gen_random_uuid(),
  shootout_id     uuid not null references penalty_shootouts(id) on delete cascade,
  sequence        int not null,
  team_code       team_code not null,
  player_id       uuid references players(id) on delete set null,
  scored          boolean not null,
  is_sudden_death boolean not null default false,
  status          entry_status not null default 'confirmed',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create unique index if not exists penalty_attempts_seq
  on penalty_attempts(shootout_id, sequence) where status = 'confirmed';

-- ---------------------------------------------------------------------
-- Timers (server-anchored)
-- ---------------------------------------------------------------------
create table if not exists timers (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  round_id       uuid references rounds(id) on delete cascade,
  match_id       uuid references matches(id) on delete cascade,
  scope          text not null,                    -- round | match | attempt
  label          text,
  segment        int not null default 1,
  mode           timer_mode not null default 'count_up',
  duration_ms    bigint,
  state          timer_state not null default 'ready',
  started_at     timestamptz,
  accumulated_ms bigint not null default 0,
  ended_at       timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists timers_round_idx on timers(round_id);
create index if not exists timers_match_idx on timers(match_id);

-- ---------------------------------------------------------------------
-- Points ledger — the single source of truth for player totals
-- ---------------------------------------------------------------------
create table if not exists player_points_ledger (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  team_id         uuid references teams(id) on delete set null,
  challenge_id    uuid references challenges(id) on delete cascade,
  round_id        uuid references rounds(id) on delete cascade,
  match_id        uuid references matches(id) on delete cascade,
  entry_type      ledger_entry_type not null,
  points          numeric not null,
  source_ref      text,                            -- attempt/goal id or other origin
  profile_version int not null default 1,
  status          entry_status not null default 'confirmed',
  reverses_id     uuid references player_points_ledger(id),
  reason          text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists ledger_player_idx    on player_points_ledger(player_id, status);
create index if not exists ledger_event_idx     on player_points_ledger(event_id, status);
create index if not exists ledger_challenge_idx on player_points_ledger(challenge_id, status);
create index if not exists ledger_source_idx    on player_points_ledger(source_ref);

-- ---------------------------------------------------------------------
-- Append-only domain event stream + audit
-- ---------------------------------------------------------------------
create table if not exists score_events (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  type              text not null,
  payload           jsonb not null default '{}'::jsonb,
  idempotency_key   text unique,
  actor_id          uuid references auth.users(id),
  device_id         text,
  expected_revision bigint,
  new_revision      bigint,
  created_at        timestamptz not null default now()
);
create index if not exists score_events_event_idx on score_events(event_id, created_at desc);

create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references events(id) on delete cascade,
  actor_id    uuid references auth.users(id),
  actor_email text,
  device_id   text,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_event_idx on audit_logs(event_id, created_at desc);

-- ---------------------------------------------------------------------
-- Display / broadcast control
-- ---------------------------------------------------------------------
create table if not exists display_state (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null unique references events(id) on delete cascade,
  program_scene   display_scene not null default 'holding',
  program_payload jsonb not null default '{}'::jsonb,
  preview_scene   display_scene,
  preview_payload jsonb not null default '{}'::jsonb,
  ceremony_phase  text,
  revision        bigint not null default 0,
  updated_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now()
);

create table if not exists sponsors (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  name         text not null,
  tier         text not null default 'sponsor',   -- host | partner | operator | sponsor | technology
  logo_url     text,
  logo_dark_url text,
  website_url  text,
  ticker_order int not null default 0,
  active       boolean not null default true
);

create table if not exists controller_lease (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null unique references events(id) on delete cascade,
  device_id    text not null,
  device_label text,
  user_id      uuid references auth.users(id),
  acquired_at  timestamptz not null default now(),
  renewed_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '15 seconds'),
  released_at  timestamptz,
  reason       text
);

-- ---------------------------------------------------------------------
-- Derived views
-- ---------------------------------------------------------------------
create or replace view player_totals as
select
  p.id                                as player_id,
  p.event_id,
  p.team_id,
  p.display_name,
  p.full_name,
  p.slug,
  p.photo_url,
  coalesce(sum(l.points) filter (where l.status = 'confirmed'
    and l.entry_type <> 'penalty_tiebreak_points'), 0)               as regular_points,
  coalesce(sum(l.points) filter (where l.status = 'confirmed'
    and l.entry_type  = 'penalty_tiebreak_points'), 0)               as penalty_points,
  coalesce(sum(l.points) filter (where l.status = 'confirmed'), 0)   as total_points
from players p
left join player_points_ledger l on l.player_id = p.id
where p.active
group by p.id;

create or replace view team_totals as
select
  t.id as team_id,
  t.event_id,
  t.code,
  t.name,
  coalesce(sum(l.points) filter (where l.status = 'confirmed'), 0) as total_points
from teams t
left join player_points_ledger l on l.team_id = t.id
group by t.id;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table app_users            enable row level security;
alter table events               enable row level security;
alter table teams                enable row level security;
alter table players              enable row level security;
alter table scoring_profiles     enable row level security;
alter table challenges           enable row level security;
alter table lineup_slots         enable row level security;
alter table rounds               enable row level security;
alter table attempts             enable row level security;
alter table matches              enable row level security;
alter table goals                enable row level security;
alter table penalty_shootouts    enable row level security;
alter table penalty_attempts     enable row level security;
alter table timers               enable row level security;
alter table player_points_ledger enable row level security;
alter table score_events         enable row level security;
alter table audit_logs           enable row level security;
alter table display_state        enable row level security;
alter table sponsors             enable row level security;
alter table controller_lease     enable row level security;

-- Public (anon + authenticated) read access to the live show data.
do $$
declare t text;
begin
  foreach t in array array[
    'events','teams','players','challenges','lineup_slots','rounds','attempts',
    'matches','goals','penalty_shootouts','penalty_attempts','timers',
    'player_points_ledger','display_state','sponsors','scoring_profiles'
  ] loop
    execute format(
      'drop policy if exists %I on %I; create policy %I on %I for select to anon, authenticated using (true);',
      t || '_public_read', t, t || '_public_read', t);
  end loop;
end $$;

-- Write access for staff roles.
do $$
declare t text;
begin
  foreach t in array array[
    'events','teams','players','challenges','lineup_slots','rounds','attempts',
    'matches','goals','penalty_shootouts','penalty_attempts','timers',
    'player_points_ledger','score_events','sponsors','scoring_profiles','controller_lease'
  ] loop
    execute format(
      'drop policy if exists %I on %I; create policy %I on %I for all to authenticated using (public.can_write()) with check (public.can_write());',
      t || '_staff_write', t, t || '_staff_write', t);
  end loop;
end $$;

-- Display operators control the TV scenes.
drop policy if exists display_state_operator on display_state;
create policy display_state_operator on display_state for all to authenticated
  using (public.can_display()) with check (public.can_display());

-- Audit log: staff read, insert-only by staff, never updated or deleted.
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select to authenticated using (public.can_write());
drop policy if exists audit_insert on audit_logs;
create policy audit_insert on audit_logs for insert to authenticated with check (public.can_write());

-- Score events readable by staff (append-only stream).
drop policy if exists score_events_read on score_events;
create policy score_events_read on score_events for select to authenticated using (public.can_write());

-- app_users: a user can read their own row; admins manage all.
drop policy if exists app_users_self on app_users;
create policy app_users_self on app_users for select to authenticated using (id = auth.uid() or public.can_admin());
drop policy if exists app_users_admin on app_users;
create policy app_users_admin on app_users for all to authenticated
  using (public.can_admin()) with check (public.can_admin());

-- ---------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'events','teams','players','challenges','lineup_slots','rounds','attempts',
    'matches','goals','penalty_shootouts','penalty_attempts','timers',
    'player_points_ledger','display_state','sponsors','controller_lease'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Full row images so realtime deletes/updates carry the previous values.
alter table rounds               replica identity full;
alter table matches              replica identity full;
alter table attempts             replica identity full;
alter table goals                replica identity full;
alter table player_points_ledger replica identity full;
alter table display_state        replica identity full;
alter table timers               replica identity full;

-- ---------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('players','players', true), ('brand','brand', true)
on conflict (id) do nothing;

drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects for select to anon, authenticated
  using (bucket_id in ('players','brand'));

drop policy if exists "staff write media" on storage.objects;
create policy "staff write media" on storage.objects for all to authenticated
  using (bucket_id in ('players','brand') and public.can_write())
  with check (bucket_id in ('players','brand') and public.can_write());

-- ---------------------------------------------------------------------
-- Revision helper — optimistic concurrency for live commands
-- ---------------------------------------------------------------------
create or replace function public.bump_event_revision(p_event_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update events set revision = revision + 1, updated_at = now()
   where id = p_event_id returning revision into v;
  return v;
end $$;
