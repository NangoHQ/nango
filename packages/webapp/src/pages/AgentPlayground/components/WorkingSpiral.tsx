const OUTER = 10;
const INNER = OUTER * 0.42;

const buildSquares = (count: number) => {
    const steps = count - 1;
    const growth = Math.pow(OUTER / INNER, 1 / steps);
    // The widest turn that keeps each square's corners inside the next one, with the hero's 0.5% gap.
    const stepAngle = (Math.asin(growth / 1.005 / Math.SQRT2) * 180) / Math.PI - 45;
    return Array.from({ length: count }, (_, i) => ({ i, r: INNER * Math.pow(growth, i), angle: -stepAngle * (steps - i) }));
};

export type SpiralSize = 'sm' | 'lg';

const SIZES: Record<SpiralSize, { className: string; strokeWidth: number; squares: ReturnType<typeof buildSquares> }> = {
    // The nango.dev hero has 35 squares; past 12 the arms blur into a solid fill at 24px.
    sm: { className: 'size-6', strokeWidth: 0.5, squares: buildSquares(12) },
    lg: { className: 'size-24', strokeWidth: 0.5, squares: buildSquares(20) }
};

export type SpiralPulse = 'ripple' | 'gather' | 'shimmer';

const PULSES: Record<SpiralPulse, { className: string; delay: (i: number, count: number) => number }> = {
    ripple: { className: 'animate-spiral-wave', delay: (i, count) => ((i - count) * 1440) / count },
    gather: { className: 'animate-spiral-band', delay: (i, count) => (-i * 900) / count },
    shimmer: { className: 'animate-spiral-shimmer', delay: (i, count) => (i % 2) * -800 - (i * 300) / count }
};

export const WorkingSpiral: React.FC<{ pulse?: SpiralPulse; size?: SpiralSize }> = ({ pulse = 'ripple', size = 'sm' }) => {
    const { className, delay } = PULSES[pulse];
    const { className: sizeClassName, strokeWidth, squares } = SIZES[size];
    return (
        <svg
            viewBox="-10.5 -10.5 21 21"
            className={`${sizeClassName} shrink-0 overflow-visible text-icon-brand [--spiral-lit:color-mix(in_oklab,var(--color-icon-brand),white_60%)] [--spiral-lit-strong:color-mix(in_oklab,var(--color-icon-brand),white_78%)] [--spiral-rest:var(--color-icon-brand)] dark:[--spiral-lit:color-mix(in_oklab,var(--color-icon-brand),transparent_70%)] dark:[--spiral-lit-strong:color-mix(in_oklab,var(--color-icon-brand),transparent_88%)] dark:[--spiral-rest:color-mix(in_oklab,var(--color-icon-brand),transparent_15%)]`}
            aria-hidden="true"
        >
            {squares.map(({ i, r, angle }) => (
                <path
                    key={i}
                    d={`M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`}
                    transform={`rotate(${angle})`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    vectorEffect="non-scaling-stroke"
                    className={`${className} motion-reduce:animate-none`}
                    style={{ animationDelay: `${delay(i, squares.length)}ms` }}
                />
            ))}
        </svg>
    );
};
