-- =====================================================================
-- Migration 0010: the two-competition day, on every profile that lacks it
--
-- The day format — four skills challenges as one competition, the 5v5 as
-- the other, golden goal on a level match, penalties on a 1-1 day — lives
-- in scoring_profiles.config->'day'. Profiles written before migration
-- 0006 never had the block, and until today the zod schema behind the
-- scoring console did not declare it either, so publishing a profile
-- silently stripped it from the new version.
--
-- Without the block every consumer falls back to the pre-format rules:
-- golden goal off, and openShootout requiring a DRAWN match instead of a
-- level day — which makes the deciding shootout of the format impossible
-- to open, with nothing reporting a fault anywhere.
--
-- Backfills the block wherever it is missing. Never overwrites one that
-- is already there, so an event deliberately running the old rules keeps
-- them.
-- =====================================================================
update scoring_profiles
set config = jsonb_set(
      config,
      '{day}',
      '{"twoCompetitions": true, "goldenGoal": true, "goldenGoalRestMinutes": 5, "shootoutDecidesDay": true}'::jsonb,
      true
    )
where config -> 'day' is null;
