import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Color Palette',
    parameters: {
        layout: 'padded'
    }
};

export default meta;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface TokenGroup {
    label: string;
    tokens: string[];
}

const SEMANTIC_GROUPS: TokenGroup[] = [
    {
        label: 'Surface',
        tokens: [
            '--surface-canvas',
            '--surface-page',
            '--surface-panel',
            '--surface-panelMuted',
            '--surface-panelInset',
            '--surface-overlay',
            '--surface-input',
            '--surface-inputMuted',
            '--surface-inverse'
        ]
    },
    {
        label: 'Text',
        tokens: [
            '--text-strong',
            '--text-default',
            '--text-secondary',
            '--text-disabled',
            '--text-inverse',
            '--text-onBrand',
            '--text-link',
            '--text-linkHover',
            '--text-brand',
            '--text-danger',
            '--text-success',
            '--text-warning'
        ]
    },
    {
        label: 'Border',
        tokens: [
            '--border-default',
            '--border-muted',
            '--border-strong',
            '--border-stronger',
            '--border-input',
            '--border-inputHover',
            '--border-selected',
            '--border-disabled',
            '--border-inverse',
            '--border-danger'
        ]
    },
    {
        label: 'Icon',
        tokens: [
            '--icon-default',
            '--icon-secondary',
            '--icon-muted',
            '--icon-disabled',
            '--icon-brand',
            '--icon-inverse',
            '--icon-success',
            '--icon-warning',
            '--icon-danger',
            '--icon-info'
        ]
    },
    {
        label: 'Interactive',
        tokens: [
            '--interactive-primary',
            '--interactive-primaryHover',
            '--interactive-primaryActive',
            '--interactive-outline',
            '--interactive-outlineHover',
            '--interactive-ghost',
            '--interactive-ghostHover',
            '--interactive-danger',
            '--interactive-dangerHover',
            '--interactive-disabled',
            '--interactive-selectedFill'
        ]
    },
    {
        label: 'State',
        tokens: ['--state-hover', '--state-pressed', '--state-selected', '--state-selectedMuted', '--state-disabled']
    },
    {
        label: 'Focus',
        tokens: ['--focus-ring-default', '--focus-ring-danger']
    },
    {
        label: 'Status · Neutral',
        tokens: ['--status-neutral-bg', '--status-neutral-border', '--status-neutral-text', '--status-neutral-icon', '--status-neutral-strong']
    },
    {
        label: 'Status · Info',
        tokens: ['--status-info-bg', '--status-info-border', '--status-info-text', '--status-info-icon', '--status-info-strong']
    },
    {
        label: 'Status · Success',
        tokens: ['--status-success-bg', '--status-success-border', '--status-success-text', '--status-success-icon', '--status-success-strong']
    },
    {
        label: 'Status · Warning',
        tokens: ['--status-warning-bg', '--status-warning-border', '--status-warning-text', '--status-warning-icon', '--status-warning-strong']
    },
    {
        label: 'Status · Danger',
        tokens: ['--status-danger-bg', '--status-danger-border', '--status-danger-text', '--status-danger-icon', '--status-danger-strong']
    },
    {
        label: 'Button · Primary',
        tokens: [
            '--button-primary-bg-default',
            '--button-primary-bg-hover',
            '--button-primary-bg-active',
            '--button-primary-bg-disabled',
            '--button-primary-text-default',
            '--button-primary-text-disabled',
            '--button-primary-icon-default'
        ]
    },
    {
        label: 'Button · Outline',
        tokens: [
            '--button-outline-bg-default',
            '--button-outline-bg-hover',
            '--button-outline-border-default',
            '--button-outline-border-hover',
            '--button-outline-text-default',
            '--button-outline-icon-default'
        ]
    },
    {
        label: 'Button · Danger',
        tokens: ['--button-danger-bg-default', '--button-danger-bg-hover', '--button-danger-text-default', '--button-danger-icon-default']
    }
];

function Swatch({ token }: { token: string }) {
    return (
        <div className="flex items-center gap-2.5 py-1.5">
            <div className="w-8 h-8 rounded-[6px] border border-border-default shrink-0" style={{ backgroundColor: `var(${token})` }} />
            <span className="text-xs font-mono text-text-secondary">{token}</span>
        </div>
    );
}

function Group({ group }: { group: TokenGroup }) {
    return (
        <div className="mb-8">
            <h2 className="story-section-heading mb-2">{group.label}</h2>
            <div className="grid grid-cols-3 gap-x-6 p-3 rounded-lg border border-border-default bg-surface-panel">
                {group.tokens.map((token) => (
                    <Swatch key={token} token={token} />
                ))}
            </div>
        </div>
    );
}

// ─── Primitive palette ───────────────────────────────────────────────────────

const PRIMITIVE_RAMPS: { label: string; prefix: string; steps: string[] }[] = [
    {
        label: 'Neutral',
        prefix: '--ds-color-neutral-',
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
        ]
    },
    {
        label: 'Brand',
        prefix: '--ds-color-brand-',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']
    },
    {
        label: 'Success',
        prefix: '--ds-color-success-',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']
    },
    {
        label: 'Warning',
        prefix: '--ds-color-warning-',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']
    },
    {
        label: 'Danger',
        prefix: '--ds-color-danger-',
        steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']
    }
];

function RampSwatch({ token, step }: { token: string; step: string }) {
    return (
        <div className="flex flex-col gap-1 items-center">
            <div className="w-full h-10 rounded border border-border-muted" style={{ backgroundColor: `var(${token})` }} />
            <span className="text-[10px] text-text-secondary font-mono">{step}</span>
        </div>
    );
}

// ─── Stories ────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof meta>;

export const Primitives: Story = {
    name: 'Primitives',
    render: () => (
        <div className="max-w-[960px] p-8">
            {PRIMITIVE_RAMPS.map((ramp) => (
                <div key={ramp.label} className="mb-8">
                    <h2 className="story-section-heading mb-2.5">{ramp.label}</h2>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${ramp.steps.length}, 1fr)` }}>
                        {ramp.steps.map((step) => (
                            <RampSwatch key={step} token={`${ramp.prefix}${step}`} step={step} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};

export const SemanticTokens: Story = {
    name: 'Semantic',
    render: () => (
        <div className="max-w-[1200px] p-8">
            {SEMANTIC_GROUPS.map((group) => (
                <Group key={group.label} group={group} />
            ))}
        </div>
    )
};
