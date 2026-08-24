-- =====================================================================
-- Migration 0003: make the event stream and points ledger append-only
--
-- 0001 gave staff a blanket "for all" policy on every table, which also
-- granted UPDATE and DELETE on score_events and player_points_ledger.
-- Both are audit surfaces: history is corrected by appending a reversal,
-- never by editing or deleting a row. Trusted server actions run through
-- the service role, which bypasses RLS, so nothing in the app depends on
-- the wider grant.
-- =====================================================================

-- score_events — insert and read only
drop policy if exists score_events_staff_write on score_events;
drop policy if exists score_events_insert      on score_events;
create policy score_events_insert on score_events
  for insert to authenticated with check (public.can_write());

-- player_points_ledger — staff may append entries (including reversals) and
-- read them; anon keeps its read policy so public standings still work.
drop policy if exists player_points_ledger_staff_write on player_points_ledger;
drop policy if exists player_points_ledger_insert      on player_points_ledger;
create policy player_points_ledger_insert on player_points_ledger
  for insert to authenticated with check (public.can_write());

-- Attempts, goals and penalty attempts are reversed by flipping status to
-- 'reversed' and appending a compensating row, so they keep UPDATE — but a
-- confirmed row must never be hard-deleted.
drop policy if exists attempts_staff_write on attempts;
create policy attempts_staff_write on attempts
  for select to authenticated using (public.can_write());
create policy attempts_staff_insert on attempts
  for insert to authenticated with check (public.can_write());
create policy attempts_staff_update on attempts
  for update to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists goals_staff_write on goals;
create policy goals_staff_write on goals
  for select to authenticated using (public.can_write());
create policy goals_staff_insert on goals
  for insert to authenticated with check (public.can_write());
create policy goals_staff_update on goals
  for update to authenticated using (public.can_write()) with check (public.can_write());

-- Deletion is blocked by the absence of a DELETE policy rather than by a
-- trigger: a trigger would also fire on the cascade from `delete from events`,
-- making an event impossible to tear down. Trusted server code runs as the
-- service role and never deletes from these tables.
