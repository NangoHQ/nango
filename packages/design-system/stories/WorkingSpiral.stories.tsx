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

const FIXED: Record<SpiralPulse, { riseEasing: string; fallEasing: string; lightHold: number; darkRestFade: number }> = {
    ripple: { riseEasing: 'ease-out', fallEasing: 'ease-in-out', lightHold: 0, darkRestFade: 15 },
    gather: { riseEasing: 'ease-out', fallEasing: 'ease-in-out', lightHold: 0, darkRestFade: 15 },
    shimmer: { riseEasing: 'linear', fallEasing: 'linear', lightHold: 0, darkRestFade: 0 }
};

interface TunerProps {
    pulse: SpiralPulse;
    durationMs: number;
    lightStart: number;
    lightestAt: number;
    backAt: number;
    strength: number;
    stagger: number;
    lineOffset: number;
}

const tunerCss = (p: TunerProps) => {
    const fixed = FIXED[p.pulse];
    const rest = [...new Set([0, p.lightStart, p.backAt, 100])].sort((a, b) => a - b);
    const lit = [...new Set([p.lightestAt, Math.min(p.lightestAt + fixed.lightHold, p.backAt)])].sort((a, b) => a - b);
    const darkFade = Math.min(p.strength + 10, 94);
    const name = `spiral-tuned-${p.pulse}`;
    const scope = `tuner-${p.pulse}`;
    const keyframes = `@keyframes ${name} {
    ${rest.join('%, ')}% { stroke: var(--tuned-rest); animation-timing-function: ${fixed.riseEasing}; }
    ${lit.join('%, ')}% { stroke: var(--tuned-lit); animation-timing-function: ${fixed.fallEasing}; }
}`;
    const colours = `.${scope} { --tuned-rest: var(--color-icon-brand); --tuned-lit: color-mix(in oklab, var(--color-icon-brand), white ${p.strength}%); }
[data-theme='dark'] .${scope} { --tuned-rest: color-mix(in oklab, var(--color-icon-brand), transparent ${fixed.darkRestFade}%); --tuned-lit: color-mix(in oklab, var(--color-icon-brand), transparent ${darkFade}%); }`;
    const staggerMs = Math.round(p.stagger * p.durationMs);
    const offsetMs = Math.round(p.lineOffset * p.durationMs);
    const delays = (count: number) =>
        Array.from({ length: count }, (_, i) => {
            const delay = (i % 2) * -offsetMs + (i * staggerMs) / count - Math.max(staggerMs, 0);
            return `.${scope} .tuner-${count} path:nth-child(${i + 1}) { animation-delay: ${Math.round(delay)}ms !important; }`;
        }).join('\n');
    const readout = `${keyframes}
${colours}
animation: ${p.durationMs}ms infinite
delay(i, count) = (i % 2) * -${offsetMs} + i * ${staggerMs} / count`;
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

const tunerArgTypes = {
    pulse: { table: { disable: true } },
    durationMs: { name: 'Cycle (ms)', control: { type: 'range', min: 600, max: 6000, step: 100 } },
    lightStart: { name: 'Light starts at (%)', ...percent },
    lightestAt: { name: 'Lightest at (%)', ...percent },
    backAt: { name: 'Back to full colour at (%)', ...percent },
    strength: { name: 'Light colour strength (%)', ...percent },
    stagger: { name: 'Stagger, + outward / − inward (cycles)', control: { type: 'range', min: -1.5, max: 1.5, step: 0.05 } },
    lineOffset: { name: 'Alternate-line offset (cycles)', control: { type: 'range', min: 0, max: 1, step: 0.05 } }
} as const;

const withoutLineOffset = { ...tunerArgTypes, lineOffset: { table: { disable: true } } } as const;

type TunerStory = StoryObj<typeof Tuner>;

export const Ripple: TunerStory = {
    render: (args) => <Tuner {...args} />,
    argTypes: withoutLineOffset,
    args: { pulse: 'ripple', durationMs: 2200, lightStart: 0, lightestAt: 15, backAt: 70, strength: 78, stagger: 1440 / 2200, lineOffset: 0 }
};

export const Gather: TunerStory = {
    render: (args) => <Tuner {...args} />,
    argTypes: withoutLineOffset,
    args: { pulse: 'gather', durationMs: 2000, lightStart: 0, lightestAt: 10, backAt: 45, strength: 60, stagger: -900 / 2000, lineOffset: 0 }
};

export const Shimmer: TunerStory = {
    render: (args) => <Tuner {...args} />,
    argTypes: tunerArgTypes,
    args: { pulse: 'shimmer', durationMs: 2400, lightStart: 0, lightestAt: 50, backAt: 100, strength: 90, stagger: -300 / 2400, lineOffset: 0.25 }
};
