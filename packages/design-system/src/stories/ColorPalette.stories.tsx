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
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 0'
            }}
        >
            <div
                style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: `var(${token})`,
                    border: '1px solid var(--border-default)',
                    flexShrink: 0
                }}
            />
            <span
                style={{
                    fontSize: 'var(--ds-typography-font-size-xs)',
                    fontFamily: 'var(--ds-typography-font-family-mono)',
                    color: 'var(--text-secondary)'
                }}
            >
                {token}
            </span>
        </div>
    );
}

function Group({ group }: { group: TokenGroup }) {
    return (
        <div
            style={{
                marginBottom: '32px'
            }}
        >
            <h2
                style={{
                    fontSize: 'var(--ds-typography-font-size-xs)',
                    fontWeight: 'var(--ds-typography-font-weight-semibold)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    margin: '0 0 8px 0',
                    fontFamily: 'var(--ds-typography-font-family-sans)'
                }}
            >
                {group.label}
            </h2>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '0 24px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--surface-panel)'
                }}
            >
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
            <div
                style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '4px',
                    backgroundColor: `var(${token})`,
                    border: '1px solid var(--border-muted)'
                }}
            />
            <span
                style={{
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--ds-typography-font-family-mono)'
                }}
            >
                {step}
            </span>
        </div>
    );
}

// ─── Stories ────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof meta>;

export const Primitives: Story = {
    name: 'Primitives',
    render: () => (
        <div style={{ maxWidth: '960px', padding: '32px' }}>
            {PRIMITIVE_RAMPS.map((ramp) => (
                <div key={ramp.label} style={{ marginBottom: '32px' }}>
                    <h2
                        style={{
                            fontSize: 'var(--ds-typography-font-size-xs)',
                            fontWeight: 'var(--ds-typography-font-weight-semibold)',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--text-secondary)',
                            margin: '0 0 10px 0',
                            fontFamily: 'var(--ds-typography-font-family-sans)'
                        }}
                    >
                        {ramp.label}
                    </h2>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${ramp.steps.length}, 1fr)`,
                            gap: '6px'
                        }}
                    >
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
    name: 'Semantic Tokens',
    render: () => (
        <div style={{ maxWidth: '960px', padding: '32px' }}>
            <p
                style={{
                    fontSize: 'var(--ds-typography-font-size-sm)',
                    color: 'var(--text-secondary)',
                    margin: '0 0 32px 0',
                    fontFamily: 'var(--ds-typography-font-family-sans)'
                }}
            >
                Semantic tokens resolve to different values per theme. Use the theme toolbar above to toggle between light and dark. New components should only
                use semantic tokens — never raw primitives.
            </p>
            {SEMANTIC_GROUPS.map((group) => (
                <Group key={group.label} group={group} />
            ))}
        </div>
    )
};
