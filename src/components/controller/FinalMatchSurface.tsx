'use client';

/**
 * Challenge 5 — THE FINAL MATCH.
 *
 * Two halves counting up across one continuous clock — 00:00 to 20:00, the
 * interval, then 20:00 to 40:00 — and two buttons big enough to hit without
 * looking down. Everything else on this surface exists to make those two
 * buttons unambiguous.
 *
 * A goal is never recorded blind: tapping +GOAL opens a sheet holding only the
 * players eligible for *that* team, an own-goal path that swaps the list to the
 * other side, and the four ways the ball can go in. The active goal-points mode
 * sits in the header the whole time, so the operator can always see what the
 * next goal is about to be worth to the individual leaderboard.
 */

import { useState } from 'react';
import { ScoreNumeral, StatusPill, TeamScoreStrip } from '@/components/ui';
import { describeGoalMode } from '@/lib/scoring/engine';
import { useTimer } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import type { GoalRow, PlayerRow, TeamCode, TimerRow } from '@/lib/types';
import {
  ConfirmControlButton,
  ControlButton,
  Panel,
  SegmentedChoice,
} from '@/components/controller/ControlButton';
import { Modal } from '@/components/controller/Modal';
import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import {
  GOAL_METHODS,
  accentFor,
  configOfMechanic,
  eligiblePlayers,
  formatShortClock,
  slotLabelForPlayer,
  type GoalMethodId,
} from '@/components/controller/controller-model';

const SIDES: TeamCode[] = ['A', 'B'];

function nameOf(player: PlayerRow): string {
  return (player.display_name ?? player.full_name).toUpperCase();
}

export function FinalMatchSurface() {
  const { snapshot, config, canMutate, runner } = useController();
  const commands = useControllerCommands();

  const match = snapshot.match;
  const finalConfig = configOfMechanic(config, 'final_match');

  const [sheet, setSheet] = useState<TeamCode | null>(null);
  const [ownGoal, setOwnGoal] = useState(false);
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [method, setMethod] = useState<GoalMethodId>('open_play');

  const halves = finalConfig?.halves ?? 2;
  const halfDurationMs = finalConfig?.halfDurationMs ?? 1_200_000;
  const currentHalf = Math.max(1, Number(match?.current_half ?? 1));

  const timer: TimerRow | null =
    snapshot.timers.find(
      (t) => match !== null && t.match_id === match.id && t.segment === currentHalf,
    ) ?? null;

  const reading = useTimer(timer, { tenths: false });
  const totals = snapshot.matchTotals;
  const status = match?.status ?? 'pending';

  if (!match) {
    return (
      <Panel tone="sunken">
        <p className="u-display text-h3 text-text-secondary">THE FINAL MATCH HAS NO FIXTURE YET</p>
        <p className="text-body text-text-secondary">
          Challenge 5 needs a match row before it can be scored. Create it from the event setup
          screen, then come back here.
        </p>
      </Panel>
    );
  }

  const goalMode = describeGoalMode(match.goal_points_mode, snapshot.scoring.match);
  const teamA = snapshot.teamsByCode.A;
  const teamB = snapshot.teamsByCode.B;

  const locked = status === 'completed';
  const goalBlocked = !canMutate
    ? 'This device does not hold the controls.'
    : locked
      ? 'The match is over. Reopen it before recording another goal.'
      : null;

  const confirmedGoals = snapshot.goals.filter((g) => g.status === 'confirmed').length;
  const reversedIds = new Set(
    snapshot.goals.filter((g) => g.reverses_id).map((g) => g.reverses_id as string),
  );

  // The sheet lists the scoring team, unless it is an own goal — in which case
  // the player who put it in is on the *other* side.
  const sheetTeam: TeamCode | null = sheet;
  const listSide: TeamCode | null =
    sheetTeam === null ? null : ownGoal ? (sheetTeam === 'A' ? 'B' : 'A') : sheetTeam;
  const candidates: PlayerRow[] =
    listSide === null
      ? []
      : eligiblePlayers(snapshot, listSide, snapshot.currentChallenge?.id ?? null);

  const closeSheet = () => {
    setSheet(null);
    setOwnGoal(false);
    setScorerId(null);
    setMethod('open_play');
  };

  const commitGoal = () => {
    if (!sheetTeam) return;
    const scorer = scorerId ? snapshot.playersById[scorerId] ?? null : null;
    const who = scorer ? nameOf(scorer) : 'UNATTRIBUTED';
    void commands
      .addGoal({
        teamCode: sheetTeam,
        scorerId: ownGoal ? null : scorerId,
        isOwnGoal: ownGoal,
        ownGoalByPlayerId: ownGoal ? scorerId : null,
        method: ownGoal ? 'own_goal' : method,
        clockMs: reading.displayMs,
        half: currentHalf,
        note: `GOAL TEAM ${sheetTeam} · ${ownGoal ? `OWN GOAL · ${who}` : who} · ${formatShortClock(
          reading.displayMs,
        )}`,
      })
      .then(closeSheet);
  };

  const clockBusy =
    timer !== null &&
    (runner.busyId === `timer:pause:${timer.id}` || runner.busyId === `timer:resume:${timer.id}`);

  return (
    <div className="flex flex-col gap-4">
      {/* --- the score, the clock and what a goal is worth ---------------- */}
      <Panel
        title="FINAL MATCH"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusPill
              label={status.replace(/_/g, ' ').toUpperCase()}
              tone={
                status === 'live'
                  ? 'live'
                  : status === 'completed'
                    ? 'winner'
                    : status === 'halftime'
                      ? 'draw'
                      : 'pending'
              }
              variant={status === 'live' ? 'solid' : 'soft'}
              size="md"
              pulse={status === 'live'}
            />
            <StatusPill
              label={`GOAL MODE: ${match.goal_points_mode.replace(/_/g, ' ').toUpperCase()}`}
              tone="accent"
              variant="soft"
              size="md"
              glyph="★"
            />
          </div>
        }
      >
        <p className="u-label text-eyebrow text-text-secondary">{goalMode.toUpperCase()}</p>

        <TeamScoreStrip
          size="lg"
          unit=""
          teamA={{
            code: 'A',
            name: teamA?.name ?? 'TEAM A',
            shortName: teamA?.short_name ?? null,
            score: totals?.scoreA ?? Number(match.score_a),
            color: teamA?.color ?? null,
          }}
          teamB={{
            code: 'B',
            name: teamB?.name ?? 'TEAM B',
            shortName: teamB?.short_name ?? null,
            score: totals?.scoreB ?? Number(match.score_b),
            color: teamB?.color ?? null,
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border-2 border-slate bg-mist p-4">
          <ScoreNumeral
            value={reading.clock}
            label={`HALF ${currentHalf} OF ${halves}`}
            size="lg"
            variant="clock"
            tone={reading.running ? 'live' : 'default'}
            animate={false}
          />
          <div className="flex flex-col items-end gap-1">
            <span className="u-label text-eyebrow text-text-muted">
              HALF ENDS AT {formatShortClock(halfDurationMs * currentHalf)}
            </span>
            <span className="u-label text-eyebrow text-text-muted">
              {reading.running ? 'CLOCK RUNNING' : 'CLOCK STOPPED'}
            </span>
          </div>
        </div>

        {/* --- the clock controls ---------------------------------------- */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {status === 'pending' || status === 'ready' ? (
            <ControlButton
              label="START FIRST HALF"
              glyph="▶"
              size="lg"
              tone="primary"
              disabled={!canMutate}
              disabledReason="This device does not hold the controls."
              busy={runner.busyId === `match:start-half:${match.id}:1`}
              onPress={() => void commands.startHalf(1)}
              className="lg:col-span-2"
            />
          ) : null}

          {status === 'live' && reading.running && timer ? (
            <ControlButton
              label="PAUSE CLOCK"
              glyph="❙❙"
              size="lg"
              tone="danger"
              disabled={!canMutate}
              disabledReason="This device does not hold the controls."
              busy={clockBusy}
              onPress={() => void commands.pauseTimer(timer.id)}
            />
          ) : null}

          {status === 'live' && !reading.running && timer ? (
            <ControlButton
              label="RESUME CLOCK"
              glyph="▶"
              size="lg"
              tone="primary"
              disabled={!canMutate}
              disabledReason="This device does not hold the controls."
              busy={clockBusy}
              onPress={() => void commands.resumeTimer(timer.id)}
            />
          ) : null}

          {status === 'live' ? (
            <ConfirmControlButton
              label={`END HALF ${currentHalf}`}
              armedLabel="TAP AGAIN TO END THE HALF"
              glyph="⏸"
              size="lg"
              tone="neutral"
              disabled={!canMutate}
              disabledReason="This device does not hold the controls."
              busy={runner.busyId === `match:end-half:${match.id}:${currentHalf}`}
              onConfirm={() => void commands.endHalf(currentHalf)}
            />
          ) : null}

          {status === 'halftime' && currentHalf < halves ? (
            <ControlButton
              label={`START HALF ${currentHalf + 1}`}
              glyph="▶"
              size="lg"
              tone="primary"
              disabled={!canMutate}
              disabledReason="This device does not hold the controls."
              busy={runner.busyId === `match:start-half:${match.id}:${currentHalf + 1}`}
              onPress={() => void commands.startHalf(currentHalf + 1)}
              className="lg:col-span-2"
            />
          ) : null}

          {status !== 'completed' && status !== 'pending' && status !== 'ready' ? (
            <ConfirmControlButton
              label="END MATCH"
              armedLabel="TAP AGAIN TO END THE MATCH"
              hint="SUBMITS THE OFFICIAL RESULT"
              glyph="⏹"
              size="lg"
              tone="danger"
              disabled={!canMutate}
              disabledReason="This device does not hold the controls."
              busy={runner.busyId?.startsWith(`match:end:${match.id}`) ?? false}
              onConfirm={() => void commands.endMatch()}
            />
          ) : null}

          {status === 'completed' ? (
            <div className="flex min-h-28 items-center justify-center rounded-lg border-2 border-winner bg-winner-soft px-4 lg:col-span-4">
              <p className="u-display text-h3 text-winner">
                FULL TIME ·{' '}
                {match.winner === 'draw'
                  ? 'DRAW'
                  : `TEAM ${match.winner ?? '—'} WINS`}
              </p>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* --- the two buttons -------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SIDES.map((code) => {
          const team = snapshot.teamsByCode[code];
          return (
            <ControlButton
              key={code}
              label={`+ GOAL ${team?.short_name?.toUpperCase() ?? `TEAM ${code}`}`}
              hint={`${(team?.name ?? `Team ${code}`).toUpperCase()} · TAP TO ATTRIBUTE`}
              glyph="⚽"
              size="xl"
              // `primary`, not `team`: the kit colour paints the live button,
              // and the aqua skin is what remains when the button is disabled —
              // a `team` tone with no accent to fall back on renders invisible.
              tone="primary"
              accent={accentFor(team, code)}
              disabled={goalBlocked !== null}
              disabledReason={goalBlocked ?? undefined}
              busy={runner.busyId === `goal:${match.id}:${confirmedGoals}:${code}`}
              onPress={() => {
                setSheet(code);
                setOwnGoal(false);
                setScorerId(null);
                setMethod('open_play');
              }}
              className="min-h-48"
            />
          );
        })}
      </div>

      <GoalList
        goals={snapshot.goals}
        reversedIds={reversedIds}
        canMutate={canMutate}
        busy={runner.busy}
      />

      {/* --- the scorer sheet ------------------------------------------- */}
      <Modal
        open={sheet !== null}
        title={sheetTeam ? `GOAL · ${snapshot.teamsByCode[sheetTeam]?.name ?? `TEAM ${sheetTeam}`}` : 'GOAL'}
        subtitle={`${formatShortClock(reading.displayMs)} · HALF ${currentHalf} · ${goalMode.toUpperCase()}`}
        accent={sheetTeam ? accentFor(snapshot.teamsByCode[sheetTeam], sheetTeam) : undefined}
        onClose={closeSheet}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <ControlButton label="CANCEL" tone="neutral" size="lg" onPress={closeSheet} />
            <ControlButton
              label="CONFIRM GOAL"
              glyph="✓"
              tone="positive"
              size="lg"
              disabled={goalBlocked !== null || (ownGoal && scorerId === null)}
              disabledReason={
                goalBlocked ?? 'Pick the player who put it into their own net.'
              }
              busy={
                sheetTeam
                  ? runner.busyId === `goal:${match.id}:${confirmedGoals}:${sheetTeam}`
                  : false
              }
              onPress={commitGoal}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <ControlButton
              label="SCORED BY THEIR OWN PLAYER"
              hint="NORMAL GOAL"
              size="md"
              tone={ownGoal ? 'neutral' : 'primary'}
              selected={!ownGoal}
              onPress={() => {
                setOwnGoal(false);
                setScorerId(null);
              }}
            />
            <ControlButton
              label="OWN GOAL"
              hint={
                sheetTeam
                  ? `PUT IN BY ${snapshot.teamsByCode[sheetTeam === 'A' ? 'B' : 'A']?.name?.toUpperCase() ?? 'THE OTHER TEAM'}`
                  : undefined
              }
              glyph="⇄"
              size="md"
              tone={ownGoal ? 'danger' : 'neutral'}
              selected={ownGoal}
              onPress={() => {
                setOwnGoal(true);
                setScorerId(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="u-label text-eyebrow text-text-muted">
              {ownGoal ? 'WHO PUT IT IN THEIR OWN NET' : 'WHO SCORED'}
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {candidates.map((player) => {
                const slot = slotLabelForPlayer(
                  snapshot,
                  player.id,
                  snapshot.currentChallenge?.id ?? null,
                );
                return (
                  <ControlButton
                    key={player.id}
                    label={nameOf(player)}
                    hint={
                      slot
                        ? `${slot}${player.jersey_number ? ` · #${player.jersey_number}` : ''}`
                        : player.jersey_number
                          ? `#${player.jersey_number}`
                          : undefined
                    }
                    size="md"
                    tone={scorerId === player.id ? 'primary' : 'neutral'}
                    selected={scorerId === player.id}
                    onPress={() =>
                      setScorerId((current) => (current === player.id ? null : player.id))
                    }
                  />
                );
              })}
              {candidates.length === 0 ? (
                <p className="text-body text-text-secondary">
                  No players are assigned to this team for the final match. Fill the lineup in setup,
                  or record the goal unattributed — the score still counts.
                </p>
              ) : null}
            </div>
            {!ownGoal ? (
              <ControlButton
                label="NO SCORER RECORDED"
                hint="THE GOAL STILL COUNTS ON THE SCOREBOARD"
                size="sm"
                tone={scorerId === null ? 'primary' : 'quiet'}
                selected={scorerId === null}
                onPress={() => setScorerId(null)}
              />
            ) : null}
          </div>

          {!ownGoal ? (
            <SegmentedChoice<GoalMethodId>
              label="HOW IT WENT IN"
              size="md"
              columns={2}
              value={method}
              onChange={setMethod}
              options={GOAL_METHODS.map((item) => ({ id: item.id, label: item.label }))}
            />
          ) : (
            <p className="u-label text-eyebrow text-draw">
              OWN GOALS ARE RECORDED AS `OWN_GOAL` AND CREDITED TO{' '}
              {sheetTeam ? `TEAM ${sheetTeam}` : 'THE BENEFITING TEAM'} ON THE SCOREBOARD.{' '}
              {snapshot.scoring.match.ownGoal.creditBenefitingTeam
                ? 'THE BENEFITING TEAM ALSO RECEIVES ITS INDIVIDUAL POINTS.'
                : 'NO INDIVIDUAL POINTS ARE AWARDED FOR IT.'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** Every goal in the match, newest first, each one reversible. */
function GoalList({
  goals,
  reversedIds,
  canMutate,
  busy,
}: {
  goals: GoalRow[];
  reversedIds: Set<string>;
  canMutate: boolean;
  busy: boolean;
}) {
  const { snapshot } = useController();
  const commands = useControllerCommands();

  const rows = [...goals]
    .filter((g) => g.reverses_id === null)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return (
    <Panel title={`GOALS · ${rows.filter((g) => g.status === 'confirmed').length} CONFIRMED`}>
      {rows.length === 0 ? (
        <p className="text-body text-text-secondary">No goals yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((goal) => {
            const player = goal.is_own_goal
              ? goal.own_goal_by_player_id
                ? snapshot.playersById[goal.own_goal_by_player_id] ?? null
                : null
              : goal.scorer_id
                ? snapshot.playersById[goal.scorer_id] ?? null
                : null;
            const gone = goal.status !== 'confirmed' || reversedIds.has(goal.id);
            return (
              <li
                key={goal.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 px-4 py-3',
                  gone
                    ? 'border-border-subtle bg-mist opacity-70'
                    : 'border-slate bg-surface-raised',
                )}
              >
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'u-display text-[1.25rem] leading-none text-text-primary',
                      gone ? 'line-through' : '',
                    )}
                  >
                    TEAM {goal.team_code} ·{' '}
                    {goal.is_own_goal
                      ? `OWN GOAL · ${player ? nameOf(player) : 'UNATTRIBUTED'}`
                      : player
                        ? nameOf(player)
                        : 'UNATTRIBUTED'}
                  </span>
                  <span className="u-label text-eyebrow text-text-muted">
                    {formatShortClock(Number(goal.clock_ms))} · HALF {goal.half} ·{' '}
                    {goal.method.replace(/_/g, ' ').toUpperCase()}
                    {gone ? ' · REVERSED' : ''}
                  </span>
                </div>
                {gone ? (
                  <StatusPill label="REVERSED" tone="neutral" variant="soft" size="sm" glyph="↺" />
                ) : (
                  <ConfirmControlButton
                    label="REVERSE"
                    armedLabel="TAP AGAIN"
                    size="sm"
                    tone="negative"
                    glyph="↺"
                    fullWidth={false}
                    className="min-w-44"
                    disabled={!canMutate}
                    disabledReason="This device does not hold the controls."
                    busy={busy}
                    onConfirm={() =>
                      void commands.reverse({
                        kind: 'goal',
                        id: goal.id,
                        description: `Team ${goal.team_code} goal at ${formatShortClock(
                          Number(goal.clock_ms),
                        )}`,
                      })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default FinalMatchSurface;
