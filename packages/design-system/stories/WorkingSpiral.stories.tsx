import { WorkingSpiral } from '@/pages/AgentPlayground/components/WorkingSpiral';

import type { SpiralPulse } from '@/pages/AgentPlayground/components/WorkingSpiral';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof WorkingSpiral> = {
    component: WorkingSpiral,
    title: 'Features/Agent Playground/WorkingSpiral',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const PULSES: { pulse: SpiralPulse; name: string }[] = [
    { pulse: 'ripple', name: '1. Ripple' },
    { pulse: 'gather', name: '2. Gather' },
    { pulse: 'shimmer', name: '3. Shimmer' }
];

const Indicator: React.FC<{ pulse: SpiralPulse }> = ({ pulse }) => (
    <div className="flex items-center gap-2 text-body-medium-regular text-text-secondary" role="status">
        <WorkingSpiral pulse={pulse} />
        <span className="animate-pulse">Thinking…</span>
    </div>
);

const BothSizes: React.FC<{ pulse: SpiralPulse }> = ({ pulse }) => (
    <div className="flex items-center gap-10">
        <Indicator pulse={pulse} />
        <WorkingSpiral pulse={pulse} size="lg" />
    </div>
);

export const Compare: Story = {
    render: () => (
        <div className="grid w-fit grid-cols-[auto_auto] items-center gap-x-10 gap-y-6">
            {PULSES.map(({ pulse, name }) => (
                <div key={pulse} className="contents">
                    <span className="text-body-small-regular text-text-tertiary">{name}</span>
                    <BothSizes pulse={pulse} />
                </div>
            ))}
        </div>
    )
};

const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'custom'] as const;
type Easing = (typeof EASINGS)[number];

interface TunerProps {
    pulse: SpiralPulse;
    durationMs: number;
    holdUntil: number;
    peakAt: number;
    peakUntil: number;
    backAt: number;
    riseEasing: Easing;
    fallEasing: Easing;
    bezierX1: number;
    bezierY1: number;
    bezierX2: number;
    bezierY2: number;
    oddOffset: number;
    staggerMs: number;
    lightModeWhite: number;
    darkModeFade: number;
    darkRestFade: number;
}

const tunerCss = (p: TunerProps) => {
    const curve = (easing: Easing) => (easing === 'custom' ? `cubic-bezier(${p.bezierX1}, ${p.bezierY1}, ${p.bezierX2}, ${p.bezierY2})` : easing);
    const rest = [...new Set([0, p.holdUntil, p.backAt, 100])].sort((a, b) => a - b);
    const lit = [...new Set([p.peakAt, p.peakUntil])].sort((a, b) => a - b);
    const name = `spiral-tuned-${p.pulse}`;
    const scope = `tuner-${p.pulse}`;
    const keyframes = `@keyframes ${name} {
    ${rest.join('%, ')}% { stroke: var(--tuned-rest); animation-timing-function: ${curve(p.riseEasing)}; }
    ${lit.join('%, ')}% { stroke: var(--tuned-lit); animation-timing-function: ${curve(p.fallEasing)}; }
}`;
    const colours = `.${scope} { --tuned-rest: var(--color-icon-brand); --tuned-lit: color-mix(in oklab, var(--color-icon-brand), white ${p.lightModeWhite}%); }
[data-theme='dark'] .${scope} { --tuned-rest: color-mix(in oklab, var(--color-icon-brand), transparent ${p.darkRestFade}%); --tuned-lit: color-mix(in oklab, var(--color-icon-brand), transparent ${p.darkModeFade}%); }`;
    const delays = (count: number) =>
        Array.from({ length: count }, (_, i) => {
            const delay = (i % 2) * -p.oddOffset * p.durationMs + (i * p.staggerMs) / count - Math.max(p.staggerMs, 0);
            return `.${scope} .tuner-${count} path:nth-child(${i + 1}) { animation-delay: ${Math.round(delay)}ms !important; }`;
        }).join('\n');
    const readout = `${keyframes}
${colours}
animation: ${p.durationMs}ms infinite
delay(i, count) = (i % 2) * -${p.oddOffset * p.durationMs} + i * ${p.staggerMs} / count`;
    const css = `${keyframes}
${colours}
.${scope} path { animation: ${name} ${p.durationMs}ms infinite !important; }
${delays(12)}
${delays(20)}`;
    return { css, readout };
};

const Tuner: React.FC<TunerProps> = (props) => {
    const { css, readout } = tunerCss(props);
    return (
        <div className={`tuner-${props.pulse} flex flex-col gap-8`}>
            <style>{css}</style>
            <div className="flex items-center gap-10">
                <div className="tuner-12">
                    <Indicator pulse={props.pulse} />
                </div>
                <div className="tuner-20">
                    <WorkingSpiral pulse={props.pulse} size="lg" />
                </div>
            </div>
            <details className="max-w-2xl text-body-small-regular text-text-tertiary">
                <summary className="cursor-pointer">Animation CSS</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{readout}</pre>
            </details>
        </div>
    );
};

const percent = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const;
const easing = { control: 'select', options: EASINGS } as const;
const bezier = (min: number) => ({ control: { type: 'range', min, max: 1.5, step: 0.01 } }) as const;

const tunerArgTypes = {
    pulse: { table: { disable: true } },
    durationMs: { name: 'Cycle (ms)', control: { type: 'range', min: 600, max: 6000, step: 100 } },
    holdUntil: { name: 'Full colour until (%)', ...percent },
    peakAt: { name: 'Light peak at (%)', ...percent },
    peakUntil: { name: 'Light hold until (%)', ...percent },
    backAt: { name: 'Back to full colour at (%)', ...percent },
    riseEasing: { name: 'Easing into the light colour', ...easing },
    fallEasing: { name: 'Easing back to full colour', ...easing },
    bezierX1: { name: 'Custom bezier x1', ...bezier(0) },
    bezierY1: { name: 'Custom bezier y1', ...bezier(-0.5) },
    bezierX2: { name: 'Custom bezier x2', ...bezier(0) },
    bezierY2: { name: 'Custom bezier y2', ...bezier(-0.5) },
    oddOffset: { name: 'Alternate-line offset (cycles)', control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    staggerMs: { name: 'Stagger, + outward / − inward (ms)', control: { type: 'range', min: -2400, max: 2400, step: 50 } },
    lightModeWhite: { name: 'Light mode: light colour white mix (%)', ...percent },
    darkModeFade: { name: 'Dark mode: light colour fade (%)', ...percent },
    darkRestFade: { name: 'Dark mode: full colour fade (%)', ...percent }
} as const;

const BEZIER = { bezierX1: 0.42, bezierY1: 0, bezierX2: 0.58, bezierY2: 1 };

type TunerStory = StoryObj<typeof Tuner>;

export const Ripple: TunerStory = {
    render: (args) => <Tuner {...args} />,
    argTypes: tunerArgTypes,
    args: {
        pulse: 'ripple',
        durationMs: 2200,
        holdUntil: 0,
        peakAt: 15,
        peakUntil: 15,
        backAt: 70,
        riseEasing: 'ease-out',
        fallEasing: 'ease-in-out',
        ...BEZIER,
        oddOffset: 0,
        staggerMs: 1440,
        lightModeWhite: 78,
        darkModeFade: 88,
        darkRestFade: 15
    }
};

export const Gather: TunerStory = {
    render: (args) => <Tuner {...args} />,
    argTypes: tunerArgTypes,
    args: {
        pulse: 'gather',
        durationMs: 2000,
        holdUntil: 0,
        peakAt: 10,
        peakUntil: 10,
        backAt: 45,
        riseEasing: 'ease-out',
        fallEasing: 'ease-in-out',
        ...BEZIER,
        oddOffset: 0,
        staggerMs: -900,
        lightModeWhite: 60,
        darkModeFade: 70,
        darkRestFade: 15
    }
};

export const Shimmer: TunerStory = {
    render: (args) => <Tuner {...args} />,
    argTypes: tunerArgTypes,
    args: {
        pulse: 'shimmer',
        durationMs: 2400,
        holdUntil: 45,
        peakAt: 62,
        peakUntil: 80,
        backAt: 100,
        riseEasing: 'ease-in-out',
        fallEasing: 'ease-in-out',
        ...BEZIER,
        oddOffset: 0.25,
        staggerMs: -300,
        lightModeWhite: 90,
        darkModeFade: 94,
        darkRestFade: 0
    }
};
