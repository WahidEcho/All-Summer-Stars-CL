/**
 * The closing ceremony, as a cue list.
 *
 * `display_state.ceremony_phase` holds one of these ids; the TV output renders
 * the matching beat of SCREEN 08 in design.md. Keeping the order here — rather
 * than in the operator's head — is what lets the console show previous /
 * current / next and stops the champion being revealed before the runner-up.
 */

export interface CeremonyCue {
  /** Value written to `display_state.ceremony_phase`. Max 60 characters. */
  phase: string;
  /** Cue number as the operator calls it. */
  cue: string;
  title: string;
  /** What the room sees, in one line. */
  beat: string;
  /** Roughly how long to sit on it before taking the next cue. */
  hold: string;
}

export const CEREMONY_CUES: CeremonyCue[] = [
  {
    phase: 'competition_complete',
    cue: 'C1',
    title: 'Competition complete',
    beat: 'Field darkens a step, competition logo, then COMPETITION COMPLETE.',
    hold: 'Hold ~8s',
  },
  {
    phase: 'champions_team',
    cue: 'C2',
    title: 'Champion team',
    beat: '2026 CHAMPIONS, the winning five together, team total, star burst.',
    hold: 'Hold ~15s',
  },
  {
    phase: 'top5_5',
    cue: 'C3',
    title: 'Number 5',
    beat: 'Fifth-placed player: photo, name, points.',
    hold: 'Hold ~7s',
  },
  {
    phase: 'top5_4',
    cue: 'C4',
    title: 'Number 4',
    beat: 'Fourth-placed player joins the line.',
    hold: 'Hold ~7s',
  },
  {
    phase: 'top5_3',
    cue: 'C5',
    title: 'Number 3',
    beat: 'Third place — the podium begins to build.',
    hold: 'Hold ~9s',
  },
  {
    phase: 'top5_2',
    cue: 'C6',
    title: 'Number 2',
    beat: 'Runner-up. Pause before the top player.',
    hold: 'Hold ~10s',
  },
  {
    phase: 'top5_1',
    cue: 'C7',
    title: 'Top player',
    beat: 'Full-screen portrait, TOP PLAYER, name and total. Strongest audio cue.',
    hold: 'Hold ~15s',
  },
  {
    phase: 'top_player_stats',
    cue: 'C8',
    title: 'Top player breakdown',
    beat: 'Challenge-by-challenge points for the winner.',
    hold: 'Hold ~12s',
  },
  {
    phase: 'closing',
    cue: 'C9',
    title: 'Closing composition',
    beat: 'Logo, champion team, top five, sponsor strip, QR. The screen the night ends on.',
    hold: 'Leave up',
  },
];

export const FIRST_CUE = CEREMONY_CUES[0];
export const LAST_CUE = CEREMONY_CUES[CEREMONY_CUES.length - 1];

/** Index of a phase in the cue list, or -1 when the ceremony has not started. */
export function cueIndexOf(phase: string | null | undefined): number {
  if (!phase) return -1;
  return CEREMONY_CUES.findIndex((cue) => cue.phase === phase);
}

export function cueAt(index: number): CeremonyCue | null {
  return CEREMONY_CUES[index] ?? null;
}

export function cueFor(phase: string | null | undefined): CeremonyCue | null {
  const index = cueIndexOf(phase);
  return index === -1 ? null : CEREMONY_CUES[index];
}
