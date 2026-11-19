import { WorkingSpiral } from '@/pages/AgentPlayground/components/WorkingSpiral';

import type { SpiralPulse } from '@/pages/AgentPlayground/components/WorkingSpiral';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof WorkingSpiral> = {
    component: WorkingSpiral,
    title: 'Features/Agent Playground/WorkingSpiral',
    parameters: { layout: 'padded' },
    argTypes: {
        pulse: { control: 'inline-radio', options: ['ripple', 'gather', 'shimmer'] },
        size: { control: 'inline-radio', options: ['sm', 'lg'] }
    }
};
export default meta;
type Story = StoryObj<typeof meta>;

const PULSES: { pulse: SpiralPulse; name: string }[] = [
    { pulse: 'ripple', name: '1. Ripple' },
    { pulse: 'gather', name: '2. Gather' },
    { pulse: 'shimmer', name: '3. Shimmer' }
];

const Indicator: React.FC<{ pulse: SpiralPulse; label: string }> = ({ pulse, label }) => (
    <div className="flex items-center gap-2 text-body-medium-regular text-text-secondary" role="status">
        <WorkingSpiral pulse={pulse} />
        <span className="animate-pulse">{label}</span>
    </div>
);

const BothSizes: React.FC<{ pulse: SpiralPulse }> = ({ pulse }) => (
    <div className="flex items-center gap-10">
        <Indicator pulse={pulse} label="Thinking…" />
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

export const Ripple: Story = { render: () => <BothSizes pulse="ripple" /> };
export const Gather: Story = { render: () => <BothSizes pulse="gather" /> };
export const Shimmer: Story = { render: () => <BothSizes pulse="shimmer" /> };

const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'custom'] as const;

interface TunerProps {
    durationMs: number;
    holdUntil: number;
    peakAt: number;
    peakUntil: number;
    backAt: number;
    easing: (typeof EASINGS)[number];
    bezierX1: number;
    bezierY1: number;
    bezierX2: number;
    bezierY2: number;
    oddOffset: number;
    staggerMs: number;
    lightModeWhite: number;
    darkModeFade: number;
}

const tunerCss = (p: TunerProps) => {
    const easing = p.easing === 'custom' ? `cubic-bezier(${p.bezierX1}, ${p.bezierY1}, ${p.bezierX2}, ${p.bezierY2})` : p.easing;
    const stops = [...new Set([0, p.holdUntil, p.backAt, 100])].sort((a, b) => a - b);
    const peaks = [...new Set([p.peakAt, p.peakUntil])].sort((a, b) => a - b);
    const keyframes = `@keyframes spiral-tuned {
    ${stops.join('%, ')}% { stroke: var(--color-icon-brand); animation-timing-function: ${easing}; }
    ${peaks.join('%, ')}% { stroke: var(--tuned-lit); animation-timing-function: ${easing}; }
}`;
    const delays = (scope: string, count: number) =>
        Array.from({ length: count }, (_, i) => {
            const delay = (i % 2) * -p.oddOffset * p.durationMs - (i * p.staggerMs) / count;
            return `.${scope} path:nth-child(${i + 1}) { animation-delay: ${Math.round(delay)}ms !important; }`;
        }).join('\n');
    return `${keyframes}
.spiral-tuner { --tuned-lit: color-mix(in oklab, var(--color-icon-brand), white ${p.lightModeWhite}%); }
[data-theme='dark'] .spiral-tuner { --tuned-lit: color-mix(in oklab, var(--color-icon-brand), transparent ${p.darkModeFade}%); }
.spiral-tuner path { animation: spiral-tuned ${p.durationMs}ms infinite !important; }
${delays('tuner-sm', 12)}
${delays('tuner-lg', 20)}`;
};

const Tuner: React.FC<TunerProps> = (props) => {
    const css = tunerCss(props);
    return (
        <div className="spiral-tuner flex flex-col gap-8">
            <style>{css}</style>
            <div className="flex items-center gap-10">
                <div className="tuner-sm flex items-center gap-2 text-body-medium-regular text-text-secondary">
                    <WorkingSpiral pulse="shimmer" />
                    <span>Thinking…</span>
                </div>
                <div className="tuner-lg">
                    <WorkingSpiral pulse="shimmer" size="lg" />
                </div>
            </div>
            <pre className="max-w-2xl overflow-x-auto text-body-small-regular whitespace-pre-wrap text-text-tertiary">{css.split('\n.tuner-sm')[0]}</pre>
        </div>
    );
};

const percent = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const;
const bezier = (min: number) => ({ control: { type: 'range', min, max: 1.5, step: 0.01 }, if: { arg: 'easing', eq: 'custom' } }) as const;

export const ShimmerTuner: StoryObj<typeof Tuner> = {
    render: (args) => <Tuner {...args} />,
    args: {
        durationMs: 2400,
        holdUntil: 45,
        peakAt: 62,
        peakUntil: 80,
        backAt: 100,
        easing: 'ease-in-out',
        bezierX1: 0.42,
        bezierY1: 0,
        bezierX2: 0.58,
        bezierY2: 1,
        oddOffset: 0.25,
        staggerMs: 300,
        lightModeWhite: 90,
        darkModeFade: 94
    },
    argTypes: {
        durationMs: { name: 'Cycle (ms)', control: { type: 'range', min: 600, max: 6000, step: 100 } },
        holdUntil: { name: 'Full colour until (%)', ...percent },
        peakAt: { name: 'Light peak at (%)', ...percent },
        peakUntil: { name: 'Light hold until (%)', ...percent },
        backAt: { name: 'Back to full colour at (%)', ...percent },
        easing: { name: 'Easing', control: 'select', options: EASINGS },
        bezierX1: { name: 'Bezier x1', ...bezier(0) },
        bezierY1: { name: 'Bezier y1', ...bezier(-0.5) },
        bezierX2: { name: 'Bezier x2', ...bezier(0) },
        bezierY2: { name: 'Bezier y2', ...bezier(-0.5) },
        oddOffset: { name: 'Alternate-line offset (cycles)', control: { type: 'range', min: 0, max: 1, step: 0.05 } },
        staggerMs: { name: 'Stagger across spiral (ms)', control: { type: 'range', min: 0, max: 2400, step: 50 } },
        lightModeWhite: { name: 'Light mode: white mix (%)', ...percent },
        darkModeFade: { name: 'Dark mode: fade (%)', ...percent }
    }
};

export const WithStatus: Story = {
    render: () => (
        <div className="flex flex-col gap-4">
            <Indicator pulse="ripple" label="Thinking…" />
            <Indicator pulse="ripple" label="Adding Linear…" />
        </div>
    )
};
