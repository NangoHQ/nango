import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Color Palette',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Ramp {
    label: string;
    steps: { step: string; cssVar: string }[];
}

const PRIMITIVE_RAMPS: Ramp[] = [
    {
        label: 'Mono',
        steps: [
            { step: 'white', cssVar: '--ds-color-mono-white' },
            { step: 'black', cssVar: '--ds-color-mono-black' }
        ]
    },
    {
        label: 'Neutral',
        steps: [
            '0',
            '25',
            '50',
            '100',
            '200',
            '250',
            '300',
            '400',
            '450',
            '500',
            '600',
            '650',
            '700',
            '750',
            '800',
            '825',
            '850',
            '875',
            '900',
            '925',
            '950',
            '975'
        ].map((s) => ({
            step: s,
            cssVar: `--ds-color-neutral-${s}`
        }))
    },
    {
        label: 'Alpha · White',
        steps: ['4', '6', '8', '10', '12', '16', '20', '24', '40', '50', '64', '72', '80'].map((s) => ({ step: s, cssVar: `--ds-color-alpha-white-${s}` }))
    },
    {
        label: 'Alpha · Black',
        steps: ['4', '6', '8', '10', '12', '16', '20', '24', '40', '64', '72', '80'].map((s) => ({ step: s, cssVar: `--ds-color-alpha-black-${s}` }))
    },
    {
        label: 'Brand',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975'].map((s) => ({ step: s, cssVar: `--ds-color-brand-${s}` }))
    },
    {
        label: 'Info',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975'].map((s) => ({ step: s, cssVar: `--ds-color-info-${s}` }))
    },
    {
        label: 'Success',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975'].map((s) => ({ step: s, cssVar: `--ds-color-success-${s}` }))
    },
    {
        label: 'Warning',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975'].map((s) => ({ step: s, cssVar: `--ds-color-warning-${s}` }))
    },
    {
        label: 'Danger',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975'].map((s) => ({ step: s, cssVar: `--ds-color-danger-${s}` }))
    },
    {
        label: 'Accent',
        steps: ['blue', 'violet', 'mint', 'pink', 'yellow'].map((s) => ({ step: s, cssVar: `--ds-color-accent-${s}-500` }))
    }
];

const SEMANTIC_GROUPS: { label: string; vars: string[] }[] = [
    {
        label: 'Surface',
        vars: [
            '--surface-canvas',
            '--surface-page',
            '--surface-panel',
            '--surface-panel-muted',
            '--surface-panel-inset',
            '--surface-raised',
            '--surface-overlay',
            '--surface-input',
            '--surface-input-muted',
            '--surface-inverse',
            '--surface-inverse-hover',
            '--surface-inverse-pressed',
            '--surface-scrim'
        ]
    },
    {
        label: 'Text',
        vars: [
            '--text-strong',
            '--text-default',
            '--text-secondary',
            '--text-muted',
            '--text-disabled',
            '--text-inverse',
            '--text-on-accent',
            '--text-on-brand',
            '--text-brand',
            '--text-link',
            '--text-link-hover',
            '--text-link-active',
            '--text-danger',
            '--text-success',
            '--text-warning'
        ]
    },
    {
        label: 'Border',
        vars: [
            '--border-muted',
            '--border-default',
            '--border-strong',
            '--border-stronger',
            '--border-input',
            '--border-input-hover',
            '--border-selected',
            '--border-danger',
            '--border-danger-hover',
            '--border-disabled',
            '--border-inverse'
        ]
    },
    {
        label: 'Icon',
        vars: [
            '--icon-default',
            '--icon-secondary',
            '--icon-muted',
            '--icon-disabled',
            '--icon-inverse',
            '--icon-on-accent',
            '--icon-brand',
            '--icon-info',
            '--icon-success',
            '--icon-warning',
            '--icon-danger'
        ]
    },
    {
        label: 'Interactive',
        vars: [
            '--interactive-primary',
            '--interactive-primary-hover',
            '--interactive-primary-active',
            '--interactive-danger',
            '--interactive-danger-hover',
            '--interactive-danger-active',
            '--interactive-ghost',
            '--interactive-ghost-hover',
            '--interactive-ghost-active',
            '--interactive-outline',
            '--interactive-outline-hover',
            '--interactive-outline-active',
            '--interactive-disabled',
            '--interactive-selected-fill'
        ]
    },
    { label: 'State', vars: ['--state-hover', '--state-pressed', '--state-selected', '--state-selected-muted', '--state-disabled'] },
    { label: 'Focus', vars: ['--focus-outline-default', '--focus-outline-danger', '--focus-ring-default', '--focus-ring-danger'] },
    {
        label: 'Status · Neutral',
        vars: ['--status-neutral-bg', '--status-neutral-border', '--status-neutral-icon', '--status-neutral-text', '--status-neutral-strong']
    },
    {
        label: 'Status · Info',
        vars: [
            '--status-info-bg',
            '--status-info-bg-hover',
            '--status-info-border',
            '--status-info-border-hover',
            '--status-info-icon',
            '--status-info-text',
            '--status-info-strong'
        ]
    },
    {
        label: 'Status · Success',
        vars: [
            '--status-success-bg',
            '--status-success-bg-hover',
            '--status-success-border',
            '--status-success-border-hover',
            '--status-success-icon',
            '--status-success-text',
            '--status-success-strong'
        ]
    },
    {
        label: 'Status · Warning',
        vars: [
            '--status-warning-bg',
            '--status-warning-bg-hover',
            '--status-warning-border',
            '--status-warning-border-hover',
            '--status-warning-icon',
            '--status-warning-text',
            '--status-warning-strong'
        ]
    },
    {
        label: 'Status · Danger',
        vars: [
            '--status-danger-bg',
            '--status-danger-bg-hover',
            '--status-danger-border',
            '--status-danger-border-hover',
            '--status-danger-icon',
            '--status-danger-text',
            '--status-danger-strong'
        ]
    },
    { label: 'Container', vars: ['--container-inset', '--container-panel', '--container-sheet'] },
    { label: 'Chart', vars: ['--chart-series-1', '--chart-series-2', '--chart-series-3', '--chart-series-4', '--chart-series-5', '--chart-series-6'] },
    { label: 'Control', vars: ['--control-switch-track-off', '--control-switch-track-off-danger', '--control-switch-thumb-off'] }
];

// ─── Components ──────────────────────────────────────────────────────────────

function Swatch({ cssVar }: { cssVar: string }) {
    return (
        <div className="flex items-center gap-2.5 py-1.5">
            <div className="w-8 h-8 rounded-[6px] border border-border-default shrink-0" style={{ backgroundColor: `var(${cssVar})` }} />
            <span className="text-xs font-mono text-text-secondary">{cssVar}</span>
        </div>
    );
}

function RampSwatch({ cssVar, step }: { cssVar: string; step: string }) {
    return (
        <div className="flex flex-col gap-1 items-center">
            <div className="w-full h-10 rounded border border-border-muted" style={{ backgroundColor: `var(${cssVar})` }} />
            <span className="text-[10px] text-text-secondary font-mono">{step}</span>
        </div>
    );
}

// ─── Stories ─────────────────────────────────────────────────────────────────

export const Primitives: Story = {
    render: () => (
        <div className="max-w-[960px] p-8">
            {PRIMITIVE_RAMPS.map(({ label, steps }) => (
                <div key={label} className="mb-8">
                    <h2 className="story-section-heading mb-2.5">{label}</h2>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
                        {steps.map(({ step, cssVar }) => (
                            <RampSwatch key={step} step={step} cssVar={cssVar} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};

export const Semantic: Story = {
    render: () => (
        <div className="max-w-[1200px] p-8">
            {SEMANTIC_GROUPS.map(({ label, vars }) => (
                <div key={label} className="mb-8">
                    <h2 className="story-section-heading mb-2">{label}</h2>
                    <div className="grid grid-cols-3 gap-x-6 p-3 rounded-lg border border-border-default bg-surface-panel">
                        {vars.map((v) => (
                            <Swatch key={v} cssVar={v} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};
