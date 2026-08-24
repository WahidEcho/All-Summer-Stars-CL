-- =====================================================================
-- Migration 0007: scene AUTO — the wall follows the scoring controller
--
-- With AUTO on program the TV runs itself: round starts cue the lineup
-- and head-to-head intros, publishes cue the results, challenge ends cue
-- the challenge result, and the 5v5 takes the wall for its whole run.
-- The operator only takes back manual control for the ceremony.
-- =====================================================================
alter type display_scene add value if not exists 'auto' before 'holding';
