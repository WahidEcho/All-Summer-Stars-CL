-- =====================================================================
-- Migration 0005: a separate rehearsal event
--
-- Testing and training previously had nowhere to go but the production
-- event, which is how a test run once wrote a whole fabricated
-- tournament onto the public site while an operator was scoring a real
-- one on a tablet.
--
-- This clones the production event's structure and roster into a second
-- event under its own slug. Point a deployment at it by setting
-- NEXT_PUBLIC_EVENT_SLUG=swanlake-rehearsal; production is then
-- unreachable from that deployment, and anything written during a
-- rehearsal lands here instead.
--
-- Re-runnable: it deletes and rebuilds the rehearsal event, never the
-- production one.
-- =====================================================================

do $$
declare
  v_src        uuid;
  v_dst        uuid;
  v_team_a     uuid;
  v_team_b     uuid;
  v_challenge  uuid;
  src_team     record;
  src_player   record;
  src_ch       record;
  src_sponsor  record;
  i int;
begin
  select id into v_src from events where slug = 'swanlake-football-stars-2026';
  if v_src is null then
    raise notice 'production event not found — nothing to clone';
    return;
  end if;

  -- Rebuild from scratch. The cascade clears every child row.
  delete from events where slug = 'swanlake-rehearsal';

  insert into events (slug, name, subtitle, venue, event_date, timezone, status,
                      holding_status, holding_headline, qr_target_url, settings)
  select 'swanlake-rehearsal',
         name || ' (REHEARSAL)',
         subtitle, venue, event_date, timezone, 'draft',
         holding_status, holding_headline, qr_target_url,
         jsonb_build_object('rehearsal', true)
  from events where id = v_src
  returning id into v_dst;

  -- ---------------- teams ----------------
  for src_team in select * from teams where event_id = v_src order by code loop
    insert into teams (event_id, code, name, short_name, color, color_secondary,
                       crest_url, display_order)
    values (v_dst, src_team.code, src_team.name, src_team.short_name, src_team.color,
            src_team.color_secondary, src_team.crest_url, src_team.display_order);
  end loop;

  select id into v_team_a from teams where event_id = v_dst and code = 'A';
  select id into v_team_b from teams where event_id = v_dst and code = 'B';

  -- ---------------- players ----------------
  -- Photos are shared public storage objects, so the rehearsal roster looks
  -- exactly like the real one without duplicating any files.
  for src_player in select * from players where event_id = v_src order by display_order loop
    insert into players (event_id, team_id, full_name, display_name, slug, jersey_number,
                         photo_url, portrait_url, focal_x, focal_y, bio, active, display_order)
    values (v_dst,
            case when src_player.team_id = (select id from teams where event_id = v_src and code = 'A')
                 then v_team_a else v_team_b end,
            src_player.full_name, src_player.display_name, src_player.slug,
            src_player.jersey_number, src_player.photo_url, src_player.portrait_url,
            src_player.focal_x, src_player.focal_y, src_player.bio,
            src_player.active, src_player.display_order);
  end loop;

  -- ---------------- scoring profile ----------------
  insert into scoring_profiles (event_id, version, config)
  select v_dst, version, config from scoring_profiles where event_id = v_src;

  -- ---------------- challenges, lineups, rounds, match ----------------
  for src_ch in select * from challenges where event_id = v_src order by number loop
    insert into challenges (event_id, number, mechanic, title, subtitle, description,
                            status, aggregation_rule, round_count)
    values (v_dst, src_ch.number, src_ch.mechanic, src_ch.title, src_ch.subtitle,
            src_ch.description, 'draft', src_ch.aggregation_rule, src_ch.round_count)
    returning id into v_challenge;

    for i in 1..5 loop
      insert into lineup_slots (challenge_id, team_id, team_code, slot_index, player_id)
      select v_challenge, v_team_a, 'A', i,
             (select id from players where event_id = v_dst and slug = 'player-a' || i);
      insert into lineup_slots (challenge_id, team_id, team_code, slot_index, player_id)
      select v_challenge, v_team_b, 'B', i,
             (select id from players where event_id = v_dst and slug = 'player-b' || i);
    end loop;

    if src_ch.mechanic <> 'final_match' then
      for i in 1..5 loop
        insert into rounds (challenge_id, number, player_a_id, player_b_id)
        select v_challenge, i,
               (select id from players where event_id = v_dst and slug = 'player-a' || i),
               (select id from players where event_id = v_dst and slug = 'player-b' || i);
      end loop;
    else
      insert into matches (challenge_id) values (v_challenge);
    end if;
  end loop;

  -- ---------------- sponsors ----------------
  for src_sponsor in select * from sponsors where event_id = v_src order by ticker_order loop
    insert into sponsors (event_id, name, tier, logo_url, logo_dark_url, website_url,
                          ticker_order, active)
    values (v_dst, src_sponsor.name, src_sponsor.tier, src_sponsor.logo_url,
            src_sponsor.logo_dark_url, src_sponsor.website_url,
            src_sponsor.ticker_order, src_sponsor.active);
  end loop;

  insert into display_state (event_id, program_scene) values (v_dst, 'holding');

  raise notice 'rehearsal event ready';
end $$;
