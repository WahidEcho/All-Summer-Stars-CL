-- =====================================================================
-- Migration 0004: give penalty_attempts the same reversal link that
-- attempts and goals already carry.
--
-- A mis-recorded penalty is corrected the same way as every other score
-- event: the original row is marked 'reversed' and a compensating row is
-- appended pointing back at it. Without this column the compensating row
-- has nothing to point at, so a reversed shootout kick cannot be traced
-- to the correction that undid it.
-- =====================================================================

alter table penalty_attempts
  add column if not exists reverses_id uuid references penalty_attempts(id);

create index if not exists penalty_attempts_reverses_idx
  on penalty_attempts(reverses_id) where reverses_id is not null;
