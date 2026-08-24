'use client';

/**
 * The always-visible header: where the show is, what the clock says, whether
 * this device is connected, and whether it is allowed to touch anything.
 */

import { StatusPill, ScoreNumeral } from '@/components/ui';
import { useTimer } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import type { ChallengeRow, TimerRow } from '@/lib/types';
import { useController } from '@/components/controller/controller-context';
import { LeaseControls } from '@/components/controller/LeaseControls';
import { relativeTime } from '@/components/controller/controller-model';
import { useEffect, useState } from 'react';

const CONNECTION_TONE = {
  live: { tone: 'winner', label: 'ONLINE', glyph: '●' },
  recovering: { tone: 'draw', label: 'RECOVERING', glyph: '↻' },
  reconnecting: { tone: 'draw', label: 'RECONNECTING', glyph: '↻' },
  offline: { tone: 'live', label: 'OFFLINE', glyph: '⚠' },
} as const;

export interface ControllerTopBarProps {
  timer: TimerRow | null;
  /** Tenths for the 60-second countdown and the stopwatch; not for a half. */
  tenths: boolean;
  challengeId: string | null;
  onSelectChallenge: (challenge: ChallengeRow) => void;
  roundId: string | null;
  onSelectRound: (roundId: string) => void;
  deviceLabel: string;
}

export function ControllerTopBar({
  timer,
  tenths,
  challengeId,
  onSelectChallenge,
  roundId,
  onSelectRound,
  deviceLabel,
}: ControllerTopBarProps) {
  const { snapshot, connection, lease, stale } = useController();
  const reading = useTimer(timer, { tenths });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const challenge = snapshot.currentChallenge;
  const round = snapshot.currentRound;
  const connectionSkin = CONNECTION_TONE[connection.status];

  const timerState =
    reading.state === 'running'
      ? { label: 'RUNNING', tone: 'live' as const }
      : reading.state === 'paused'
        ? { label: 'PAUSED', tone: 'draw' as const }
        : reading.state === 'ended'
          ? { label: 'STOPPED', tone: 'neutral' as const }
          : { label: 'READY', tone: 'pending' as const };

  return (
    <header className="sticky top-0 z-30 flex flex-col gap-3 border-b-2 border-slate bg-surface-raised/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-56 flex-col gap-1">
          <span className="u-eyebrow text-eyebrow text-aqua-700">ACTIVE SCORE CONTROLLER</span>
          <h1 className="u-display text-h3 leading-none text-text-primary">
            {challenge ? `C${challenge.number} · ${challenge.title}` : 'NO CHALLENGE SELECTED'}
          </h1>
          <p className="u-label text-eyebrow text-text-muted">
            {round
              ? `ROUND ${round.number} · A${round.number} v B${round.number} · ${round.status.replace(/_/g, ' ').toUpperCase()}`
              : challenge?.mechanic === 'final_match'
                ? `FINAL MATCH · ${(snapshot.match?.status ?? 'pending').replace(/_/g, ' ').toUpperCase()}`
                : 'NO ROUND ON THE CLOCK'}
          </p>
        </div>

        <div className="flex flex-col items-center gap-1">
          <ScoreNumeral
            value={reading.clock}
            label={timer?.label ?? 'CLOCK'}
            size="md"
            variant="clock"
            tone={reading.expired ? 'live' : 'default'}
            animate={false}
          />
          <div className="flex items-center gap-2">
            <StatusPill label={timerState.label} tone={timerState.tone} size="sm" />
            {reading.expired && reading.durationMs !== null ? (
              <StatusPill label="TIME UP" tone="live" variant="solid" size="sm" glyph="⏱" />
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusPill
              label={connectionSkin.label}
              tone={connectionSkin.tone}
              glyph={connectionSkin.glyph}
              variant={connection.status === 'live' ? 'soft' : 'solid'}
              size="sm"
            />
            {stale ? <StatusPill label="SHOWING LAST GOOD DATA" tone="draw" size="sm" /> : null}
            <span className="u-label text-eyebrow text-text-muted">
              SYNCED {relativeTime(snapshot.fetchedAt, now).toUpperCase()}
            </span>
          </div>
          <LeaseControls lease={lease} deviceLabel={deviceLabel} className="items-end text-right" />
        </div>
      </div>

      {/* Challenge and round jump bar — the operator must always be able to
          score a round the automatic "current" pick did not land on. */}
      <div className="flex flex-wrap items-center gap-4">
        <nav aria-label="Challenge" className="flex flex-wrap items-center gap-1.5">
          {snapshot.challenges.map((item) => {
            const active = challengeId ? item.id === challengeId : item.id === challenge?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectChallenge(item)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'u-display min-h-12 rounded-md border-2 px-3 text-[1.1rem] leading-none',
                  active
                    ? 'border-aqua-700 bg-aqua-600 text-white'
                    : 'border-slate bg-surface-raised text-text-secondary',
                )}
              >
                C{item.number}
                <span className="u-sr-only"> {item.title}</span>
              </button>
            );
          })}
        </nav>

        {snapshot.rounds.length > 0 ? (
          <nav aria-label="Round" className="flex flex-wrap items-center gap-1.5">
            <span className="u-label text-eyebrow text-text-muted">ROUND</span>
            {snapshot.rounds.map((item) => {
              const active = roundId ? item.id === roundId : item.id === round?.id;
              const done = item.status === 'published' || item.status === 'completed';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRound(item.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'u-numeral min-h-12 min-w-12 rounded-md border-2 px-2 text-[1.1rem] leading-none',
                    active
                      ? 'border-aqua-700 bg-aqua-600 text-white'
                      : done
                        ? 'border-winner bg-winner-soft text-winner'
                        : 'border-slate bg-surface-raised text-text-secondary',
                  )}
                >
                  {item.number}
                  {done ? <span aria-hidden> ✓</span> : null}
                  <span className="u-sr-only">
                    {' '}
                    round {item.number} {item.status.replace(/_/g, ' ')}
                  </span>
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export default ControllerTopBar;
