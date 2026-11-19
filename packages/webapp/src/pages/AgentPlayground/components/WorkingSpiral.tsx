// The nango.dev hero has 35 squares; past 12 the arms blur into a solid fill at 24px.
const SQUARES = 12;
const OUTER = 10;
const INNER = OUTER * 0.42;

const STEPS = SQUARES - 1;
const GROWTH = Math.pow(OUTER / INNER, 1 / STEPS);
// The widest turn that keeps each square's corners inside the next one, with the hero's 0.5% gap.
const STEP_ANGLE = (Math.asin(GROWTH / 1.005 / Math.SQRT2) * 180) / Math.PI - 45;

export type SpiralPulse = 'ripple' | 'gather' | 'shimmer';

const PULSES: Record<SpiralPulse, { className: string; delay: (i: number) => number }> = {
    ripple: { className: 'animate-spiral-wave', delay: (i) => (i - SQUARES) * 300 },
    gather: { className: 'animate-spiral-band', delay: (i) => -i * 110 },
    shimmer: { className: 'animate-spiral-shimmer', delay: (i) => (i % 2) * -1200 - i * 40 }
};

const squares = Array.from({ length: SQUARES }, (_, i) => ({
    i,
    r: INNER * Math.pow(GROWTH, i),
    angle: -STEP_ANGLE * (STEPS - i)
}));

export const WorkingSpiral: React.FC<{ pulse?: SpiralPulse }> = ({ pulse = 'ripple' }) => {
    const { className, delay } = PULSES[pulse];
    return (
        <svg viewBox="-10.5 -10.5 21 21" className="size-6 shrink-0 overflow-visible text-icon-brand" aria-hidden="true">
            {squares.map(({ i, r, angle }) => (
                <path
                    key={i}
                    d={`M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`}
                    transform={`rotate(${angle})`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                    className={`${className} motion-reduce:animate-none`}
                    style={{ animationDelay: `${delay(i)}ms` }}
                />
            ))}
        </svg>
    );
};
