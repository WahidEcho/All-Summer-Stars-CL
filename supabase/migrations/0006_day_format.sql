-- =====================================================================
-- Migration 0006: the day as two competitions, and golden goal
--
-- Rules confirmed by the organiser on 24 Aug 2026:
--   * The four skills challenges form Competition 1, decided by total team
--     points across challenges 1-4.
--   * The 5v5 final is Competition 2. Level at full time -> five-minute
--     rest -> golden goal: first score wins the match.
--   * One day point per competition. 1-1 sends the day to a penalty
--     shootout (alternating; sudden death repeats the order until decided).
--   * The day winner is the champion team. Individual points still decide
--     the Top-5 prizes.
-- =====================================================================

-- New match state between full-time-level and completed.
alter type match_status add value if not exists 'golden_goal' after 'result_ready';

-- Day-format settings live in the scoring profile so the admin can tune them.
update scoring_profiles sp
set config = jsonb_set(
  sp.config,
  '{day}',
  coalesce(sp.config->'day', '{}'::jsonb) || jsonb_build_object(
    'twoCompetitions', true,
    'goldenGoal', true,
    'goldenGoalRestMinutes', 5,
    'shootoutDecidesDay', true
  ),
  true
)
where not (sp.config ? 'day');
