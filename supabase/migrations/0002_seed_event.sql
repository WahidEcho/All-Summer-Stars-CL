-- =====================================================================
-- Migration 0002: seed the SwanLake Football Stars event
-- Mechanics and point values come from the official event rules PDF.
-- Everything here is editable from the admin settings screens.
-- =====================================================================

do $$
declare
  v_event_id     uuid;
  v_team_a       uuid;
  v_team_b       uuid;
  v_challenge_id uuid;
  v_match_id     uuid;
  i int;
  c int;
begin
  -- ---------------- Event ----------------
  insert into events (slug, name, subtitle, venue, event_date, timezone, status,
                      holding_status, holding_headline, qr_target_url)
  values ('swanlake-football-stars-2026',
          'SwanLake Football Stars',
          'Shores & Scores Challenge',
          'SwanLake North Coast',
          date '2026-08-27',
          'Africa/Cairo',
          'draft',
          'STARTING SOON',
          'LIVE FROM SWANLAKE NORTH COAST',
          null)
  on conflict (slug) do update set name = excluded.name
  returning id into v_event_id;

  -- ---------------- Teams ----------------
  insert into teams (event_id, code, name, short_name, color, color_secondary, display_order)
  values (v_event_id, 'A', 'Team A', 'TEAM A', '#0E6BA8', '#8FD4E8', 1)
  on conflict (event_id, code) do update set name = excluded.name
  returning id into v_team_a;

  insert into teams (event_id, code, name, short_name, color, color_secondary, display_order)
  values (v_event_id, 'B', 'Team B', 'TEAM B', '#D3323C', '#F5A3A8', 2)
  on conflict (event_id, code) do update set name = excluded.name
  returning id into v_team_b;

  -- ---------------- Players (placeholders) ----------------
  for i in 1..5 loop
    insert into players (event_id, team_id, full_name, display_name, slug, jersey_number, display_order)
    values (v_event_id, v_team_a, 'Player A' || i, 'PLAYER A' || i, 'player-a' || i, i, i)
    on conflict (event_id, slug) do nothing;

    insert into players (event_id, team_id, full_name, display_name, slug, jersey_number, display_order)
    values (v_event_id, v_team_b, 'Player B' || i, 'PLAYER B' || i, 'player-b' || i, i, i)
    on conflict (event_id, slug) do nothing;
  end loop;

  -- ---------------- Scoring profile ----------------
  insert into scoring_profiles (event_id, version, config)
  values (v_event_id, 1, jsonb_build_object(
    'challenges', jsonb_build_object(
      '1', jsonb_build_object(
        'mechanic','mannequin_target',
        'attemptsPerPlayer', 3,
        'targets', jsonb_build_array(
          jsonb_build_object('id','t10','label','TARGET 10','points',1),
          jsonb_build_object('id','t30','label','TARGET 30','points',3),
          jsonb_build_object('id','t50','label','TARGET 50','points',5)),
        'missPoints', 0),
      '2', jsonb_build_object(
        'mechanic','dribble_finish',
        'attemptsPerPlayer', 3,
        'dribbleThresholdMs', 15000,
        'dribbleBonusPoints', 2,
        'goalPoints', 3,
        'maxPointsPerAttempt', 5),
      '3', jsonb_build_object(
        'mechanic','long_range',
        'attemptsPerPlayer', 3,
        'zones', jsonb_build_array(
          jsonb_build_object('id','green100','label','GREEN 100','points',10,'color','#3FAE49'),
          jsonb_build_object('id','blue50','label','BLUE 50','points',5,'color','#2C7FC4'),
          jsonb_build_object('id','red30','label','RED 30','points',3,'color','#D3323C'),
          jsonb_build_object('id','red20','label','RED 20','points',2,'color','#E2686F')),
        'missPoints', 0),
      '4', jsonb_build_object(
        'mechanic','center_circle',
        'ballsPerPlayer', 10,
        'timeLimitMs', 60000,
        'pointsPerHit', 1),
      '5', jsonb_build_object(
        'mechanic','final_match',
        'halves', 2,
        'halfDurationMs', 1200000)
    ),
    'match', jsonb_build_object(
      'goalPointsMode','team_share',
      'teamShare',       jsonb_build_object('pointsPerPlayer', 10),
      'scorerOnly',      jsonb_build_object('scorerPoints', 10),
      'scorerPlusTeam',  jsonb_build_object('scorerPoints', 10, 'teammatePoints', 5),
      'ownGoal',         jsonb_build_object('creditBenefitingTeam', true, 'scorerGetsPoints', false),
      'winBonus', 0),
    'bonuses', jsonb_build_object(
      'roundWinBonus', 0,
      'roundDrawPoints', 0,
      'challengeWinBonus', 0),
    'penalties', jsonb_build_object(
      'enabledFor','final_match_only',
      'openingAttempts', 3,
      'suddenDeath', true,
      'pointsPerScoredAttempt', 0,
      'winnerPoints', 0),
    'ranking', jsonb_build_object(
      'primary','regular_points',
      'tiebreakers', jsonb_build_array('penalty_tiebreak_points'),
      'sharedRankOnTie', true)
  ))
  on conflict (event_id, version) do nothing;

  -- ---------------- Challenges ----------------
  insert into challenges (event_id, number, mechanic, title, subtitle, description, round_count) values
    (v_event_id, 1, 'mannequin_target', 'MANNEQUIN TARGET', 'Challenge 01',
     'Both players shoot from the same spot outside the centre circle. Three shots each at four mannequins: Target 10 = 1 point, Target 30 = 3 points, Target 50 = 5 points.', 5),
    (v_event_id, 2, 'dribble_finish', 'DRIBBLE & FINISH', 'Challenge 02',
     'Players take turns. Three attempts each: dribble through four mannequins as fast as possible then go one-on-one with the goalkeeper. Dribble under 15 seconds = 2 points, scoring = 3 points. Maximum 5 points per attempt.', 5),
    (v_event_id, 3, 'long_range', 'LONG-RANGE SHOOTING', 'Challenge 03',
     'Both players shoot from the same spot 20–25 metres out at a target board. Green 100 = 10 points, Blue 50 = 5 points, Red 30 = 3 points, Red 20 = 2 points. Three shots each, taking turns.', 5),
    (v_event_id, 4, 'center_circle', 'CENTRE CIRCLE ACCURACY', 'Challenge 04',
     'Ten balls placed around a large circle with a target box at its centre. Each player has 60 seconds. Every ball landing in the centre circle with one touch = 1 point.', 5),
    (v_event_id, 5, 'final_match', 'FINAL MATCH', 'Challenge 05',
     'Full 5v5 team match. Two halves of 20 minutes on a continuous count-up clock.', 1)
  on conflict (event_id, number) do update set
    mechanic = excluded.mechanic, title = excluded.title,
    subtitle = excluded.subtitle, description = excluded.description;

  -- ---------------- Lineup slots + rounds per challenge ----------------
  for c in 1..5 loop
    select id into v_challenge_id from challenges where event_id = v_event_id and number = c;

    for i in 1..5 loop
      insert into lineup_slots (challenge_id, team_id, team_code, slot_index, player_id)
      select v_challenge_id, v_team_a, 'A', i,
             (select id from players where event_id = v_event_id and slug = 'player-a' || i)
      where not exists (select 1 from lineup_slots
                        where challenge_id = v_challenge_id and team_code = 'A' and slot_index = i);

      insert into lineup_slots (challenge_id, team_id, team_code, slot_index, player_id)
      select v_challenge_id, v_team_b, 'B', i,
             (select id from players where event_id = v_event_id and slug = 'player-b' || i)
      where not exists (select 1 from lineup_slots
                        where challenge_id = v_challenge_id and team_code = 'B' and slot_index = i);
    end loop;

    if c <= 4 then
      for i in 1..5 loop
        insert into rounds (challenge_id, number, player_a_id, player_b_id)
        select v_challenge_id, i,
               (select id from players where event_id = v_event_id and slug = 'player-a' || i),
               (select id from players where event_id = v_event_id and slug = 'player-b' || i)
        where not exists (select 1 from rounds where challenge_id = v_challenge_id and number = i);
      end loop;
    else
      insert into matches (challenge_id) select v_challenge_id
      where not exists (select 1 from matches where challenge_id = v_challenge_id)
      returning id into v_match_id;
    end if;
  end loop;

  -- ---------------- Sponsors (confirmed ticker order) ----------------
  insert into sponsors (event_id, name, tier, ticker_order, logo_url) values
    (v_event_id, 'Yalla Sahel',             'partner',    1, '/brand/yalla-sahel.svg'),
    (v_event_id, 'Tellr',                   'partner',    2, '/brand/tellr.svg'),
    (v_event_id, 'SwanLake North Coast',    'host',       3, '/brand/swanlake-north-coast.svg'),
    (v_event_id, 'Hassan Allam Properties', 'host',       4, '/brand/hassan-allam.svg'),
    (v_event_id, 'Sports United',           'operator',   5, '/brand/sports-united.svg'),
    (v_event_id, 'Powered by Move Beyond',  'technology', 6, '/brand/move-beyond.svg')
  on conflict do nothing;

  -- ---------------- Display state ----------------
  insert into display_state (event_id, program_scene) values (v_event_id, 'holding')
  on conflict (event_id) do nothing;
end $$;
