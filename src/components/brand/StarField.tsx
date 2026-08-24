import { cn } from '@/lib/cn';

export type StarFieldVariant = 'holding' | 'live' | 'result' | 'ceremony';
export type StarFieldIntensity = 'subtle' | 'standard' | 'vivid';

export interface StarFieldProps {
  /**
   * `holding`  — the full show: nested stars, pitch, drifting wash, sweep.
   * `live`     — quiet enough to sit behind players and scores.
   * `result`   — stars plus a soft centre glow for a result reveal.
   * `ceremony` — deepest wash and strongest star geometry.
   */
  variant?: StarFieldVariant;
  intensity?: StarFieldIntensity;
  /** Centre of the star burst, as fractions of the canvas. Default `[0.5, 0.44]`. */
  focal?: readonly [number, number];
  /** Override the variant's default for the pale pitch geometry. */
  pitch?: boolean;
  /** Override the variant's default for the periodic light sweep. */
  sweep?: boolean;
  className?: string;
}

const VIEW_W = 1920;
const VIEW_H = 1080;

/** Points of an `n`-pointed star, ready for `<polygon points>`. */
function starPoints(cx: number, cy: number, outer: number, points = 5, rotation = -90): string {
  const inner = outer * 0.478;
  const out: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const angle = (Math.PI / points) * i + (rotation * Math.PI) / 180;
    const radius = i % 2 === 0 ? outer : inner;
    out.push(
      `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`,
    );
  }
  return out.join(' ');
}

const PRESET: Record<
  StarFieldVariant,
  {
    wash: string;
    starOpacity: number;
    starStroke: string;
    rings: number;
    pitch: boolean;
    sweep: boolean;
    glow: boolean;
  }
> = {
  holding: {
    wash:
      'radial-gradient(120% 90% at 50% 12%, #ffffff 0%, var(--color-aqua-50) 38%, var(--color-aqua-100) 72%, var(--color-aqua-200) 100%)',
    starOpacity: 0.5,
    starStroke: 'var(--color-aqua-400)',
    rings: 11,
    pitch: true,
    sweep: true,
    glow: false,
  },
  live: {
    wash:
      'linear-gradient(180deg, #ffffff 0%, var(--color-cream) 46%, var(--color-mist) 100%)',
    starOpacity: 0.24,
    starStroke: 'var(--color-aqua-400)',
    rings: 8,
    pitch: true,
    sweep: false,
    glow: false,
  },
  result: {
    wash:
      'radial-gradient(110% 80% at 50% 46%, #ffffff 0%, var(--color-aqua-50) 44%, var(--color-aqua-100) 100%)',
    starOpacity: 0.34,
    starStroke: 'var(--color-aqua-500)',
    rings: 9,
    pitch: false,
    sweep: false,
    glow: true,
  },
  ceremony: {
    wash:
      'radial-gradient(120% 100% at 50% 34%, #ffffff 0%, var(--color-aqua-100) 40%, var(--color-aqua-300) 100%)',
    starOpacity: 0.62,
    starStroke: 'var(--color-aqua-600)',
    rings: 13,
    pitch: true,
    sweep: true,
    glow: true,
  },
};

const INTENSITY: Record<StarFieldIntensity, number> = {
  subtle: 0.55,
  standard: 1,
  vivid: 1.5,
};

/** Fixed twinkle positions — deterministic so server and client agree. */
const TWINKLES: ReadonlyArray<readonly [number, number, number, number]> = [
  [188, 168, 13, 0],
  [402, 792, 9, 1.6],
  [664, 236, 7, 3.1],
  [1268, 176, 11, 0.8],
  [1512, 604, 8, 2.3],
  [1746, 318, 12, 4.2],
  [928, 916, 9, 1.1],
  [1602, 928, 7, 3.6],
  [286, 520, 8, 5.1],
  [1084, 96, 6, 2.7],
];

/**
 * The pale animated background: nested star-line geometry lifted from the
 * competition key art, a soft football-pitch overlay and a slow aqua wash.
 *
 * Everything animates with `transform` and `opacity` only, so it composites on
 * the GPU and costs nothing on a Chromecast-class display driving the LED
 * wall. Under `prefers-reduced-motion` every loop stops and the field becomes
 * a still image — the design still reads, it simply stops moving.
 *
 * Server component. Drop it as the first child of a `relative` container.
 */
export function StarField({
  variant = 'live',
  intensity = 'standard',
  focal = [0.5, 0.44],
  pitch,
  sweep,
  className,
}: StarFieldProps) {
  const preset = PRESET[variant];
  const k = INTENSITY[intensity];
  const showPitch = pitch ?? preset.pitch;
  const showSweep = sweep ?? preset.sweep;

  const cx = focal[0] * VIEW_W;
  const cy = focal[1] * VIEW_H;

  const rings = Array.from({ length: preset.rings }, (_, i) => {
    const t = (i + 1) / preset.rings;
    return {
      key: i,
      radius: 150 + t * 1420,
      opacity: Math.min(0.9, preset.starOpacity * k * (1 - t * 0.62)),
      width: 2 + (1 - t) * 5,
      rotation: -90 + i * 4,
    };
  });

  return (
    <div
      aria-hidden
      data-star-field={variant}
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ background: preset.wash }}
    >
      {/* Star-line geometry — two counter-rotating stacks so the pattern never
          reads as a single spinning wheel. */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <g
          data-ambient
          className="animate-star-spin origin-center"
          style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box' }}
        >
          {rings
            .filter((_, i) => i % 2 === 0)
            .map((ring) => (
              <polygon
                key={ring.key}
                points={starPoints(cx, cy, ring.radius, 5, ring.rotation)}
                fill="none"
                stroke={preset.starStroke}
                strokeWidth={ring.width}
                strokeLinejoin="round"
                opacity={ring.opacity}
              />
            ))}
        </g>

        <g
          data-ambient
          className="animate-star-spin-reverse"
          style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box' }}
        >
          {rings
            .filter((_, i) => i % 2 === 1)
            .map((ring) => (
              <polygon
                key={ring.key}
                points={starPoints(cx, cy, ring.radius * 0.92, 5, ring.rotation + 36)}
                fill="none"
                stroke={preset.starStroke}
                strokeWidth={ring.width * 0.7}
                strokeLinejoin="round"
                opacity={ring.opacity * 0.7}
              />
            ))}
        </g>

        {/* Football pitch geometry — halfway line, centre circle, penalty box. */}
        {showPitch ? (
          <g
            fill="none"
            stroke="var(--color-aqua-500)"
            strokeWidth={3}
            opacity={0.16 * k}
            data-ambient
            className="animate-drift-slow"
          >
            <line x1={VIEW_W / 2} y1={-40} x2={VIEW_W / 2} y2={VIEW_H + 40} />
            <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={218} />
            <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={9} fill="var(--color-aqua-500)" />
            <rect x={-260} y={VIEW_H / 2 - 300} width={520} height={600} rx={4} />
            <rect x={VIEW_W - 260} y={VIEW_H / 2 - 300} width={520} height={600} rx={4} />
            <path d={`M 260 ${VIEW_H / 2 - 110} A 130 110 0 0 1 260 ${VIEW_H / 2 + 110}`} />
            <path
              d={`M ${VIEW_W - 260} ${VIEW_H / 2 - 110} A 130 110 0 0 0 ${VIEW_W - 260} ${
                VIEW_H / 2 + 110
              }`}
            />
          </g>
        ) : null}

        {/* Individual twinkling stars, offset so they never pulse in unison. */}
        <g fill="var(--color-aqua-500)" opacity={0.5 * k}>
          {TWINKLES.map(([x, y, r, delay]) => (
            <polygon
              key={`${x}-${y}`}
              points={starPoints(x, y, r, 5)}
              data-ambient
              className="animate-twinkle"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>
      </svg>

      {/* Slow drifting wash — adds life without any visible motion. */}
      <div
        data-ambient
        className="animate-drift-slower absolute -inset-[12%]"
        style={{
          background:
            'radial-gradient(42% 44% at 30% 28%, color-mix(in oklab, var(--color-white) 82%, transparent) 0%, transparent 70%)',
        }}
      />

      {preset.glow ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(46% 52% at 50% 46%, color-mix(in oklab, var(--color-white) 76%, transparent) 0%, transparent 72%)',
          }}
        />
      ) : null}

      {/* Occasional light sweep — every 13s, behind everything else. */}
      {showSweep ? (
        <div className="absolute inset-0 overflow-hidden">
          <div
            data-ambient
            className="animate-sweep absolute inset-y-[-25%] left-0 w-[26%]"
            style={{
              background:
                'linear-gradient(100deg, transparent 0%, color-mix(in oklab, var(--color-white) 88%, transparent) 50%, transparent 100%)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default StarField;
