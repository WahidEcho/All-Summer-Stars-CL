-- =====================================================================
-- Migration 0008: scene PLAYER ENTRANCE — the walk-out reveal
--
-- The players come out of the gate one at a time at the top of the show.
-- The operator sends each one to the wall as they emerge, and the card
-- holds until the next player is pushed, so the wall is never blank
-- between entrances. `program_payload.playerId` names who is on screen;
-- an empty payload is the welcome frame the sequence opens on.
-- =====================================================================
alter type display_scene add value if not exists 'player_entrance';
