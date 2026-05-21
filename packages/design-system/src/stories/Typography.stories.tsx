import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Typography',
    parameters: {
        layout: 'padded'
    }
};

export default meta;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface TypeScale {
    name: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing?: string;
    fontFamily?: string;
}

const SANS_SCALE: TypeScale[] = [
    {
        name: 'Display · 4xl',
        fontSize: 'var(--ds-typography-font-size-4xl)',
        fontWeight: 'var(--ds-typography-font-weight-bold)',
        lineHeight: 'var(--ds-typography-line-height-tight)',
        letterSpacing: 'var(--ds-typography-letter-spacing-tight)'
    },
    {
        name: 'Display · 3xl',
        fontSize: 'var(--ds-typography-font-size-3xl)',
        fontWeight: 'var(--ds-typography-font-weight-bold)',
        lineHeight: 'var(--ds-typography-line-height-tight)',
        letterSpacing: 'var(--ds-typography-letter-spacing-tight)'
    },
    {
        name: 'Heading · 2xl',
        fontSize: 'var(--ds-typography-font-size-2xl)',
        fontWeight: 'var(--ds-typography-font-weight-semibold)',
        lineHeight: 'var(--ds-typography-line-height-snug)'
    },
    {
        name: 'Heading · xl',
        fontSize: 'var(--ds-typography-font-size-xl)',
        fontWeight: 'var(--ds-typography-font-weight-semibold)',
        lineHeight: 'var(--ds-typography-line-height-snug)'
    },
    {
        name: 'Heading · lg',
        fontSize: 'var(--ds-typography-font-size-lg)',
        fontWeight: 'var(--ds-typography-font-weight-semibold)',
        lineHeight: 'var(--ds-typography-line-height-snug)'
    },
    {
        name: 'Body · lg',
        fontSize: 'var(--ds-typography-font-size-lg)',
        fontWeight: 'var(--ds-typography-font-weight-regular)',
        lineHeight: 'var(--ds-typography-line-height-normal)'
    },
    {
        name: 'Body · md',
        fontSize: 'var(--ds-typography-font-size-md)',
        fontWeight: 'var(--ds-typography-font-weight-regular)',
        lineHeight: 'var(--ds-typography-line-height-normal)'
    },
    {
        name: 'Body · sm',
        fontSize: 'var(--ds-typography-font-size-sm)',
        fontWeight: 'var(--ds-typography-font-weight-regular)',
        lineHeight: 'var(--ds-typography-line-height-normal)'
    },
    {
        name: 'Label · md · medium',
        fontSize: 'var(--ds-typography-font-size-md)',
        fontWeight: 'var(--ds-typography-font-weight-medium)',
        lineHeight: 'var(--ds-typography-line-height-snug)'
    },
    {
        name: 'Label · sm · medium',
        fontSize: 'var(--ds-typography-font-size-sm)',
        fontWeight: 'var(--ds-typography-font-weight-medium)',
        lineHeight: 'var(--ds-typography-line-height-snug)'
    },
    {
        name: 'Label · xs · medium',
        fontSize: 'var(--ds-typography-font-size-xs)',
        fontWeight: 'var(--ds-typography-font-weight-medium)',
        lineHeight: 'var(--ds-typography-line-height-snug)',
        letterSpacing: 'var(--ds-typography-letter-spacing-wide)'
    },
    {
        name: 'Label · 2xs · medium',
        fontSize: 'var(--ds-typography-font-size-2xs)',
        fontWeight: 'var(--ds-typography-font-weight-medium)',
        lineHeight: 'var(--ds-typography-line-height-snug)',
        letterSpacing: 'var(--ds-typography-letter-spacing-wide)'
    }
];

const MONO_SCALE: TypeScale[] = [
    {
        name: 'Code · md',
        fontSize: 'var(--ds-typography-font-size-md)',
        fontWeight: 'var(--ds-typography-font-weight-regular)',
        lineHeight: 'var(--ds-typography-line-height-relaxed)',
        fontFamily: 'var(--ds-typography-font-family-mono)'
    },
    {
        name: 'Code · sm',
        fontSize: 'var(--ds-typography-font-size-sm)',
        fontWeight: 'var(--ds-typography-font-weight-regular)',
        lineHeight: 'var(--ds-typography-line-height-relaxed)',
        fontFamily: 'var(--ds-typography-font-family-mono)'
    },
    {
        name: 'Code · xs',
        fontSize: 'var(--ds-typography-font-size-xs)',
        fontWeight: 'var(--ds-typography-font-weight-regular)',
        lineHeight: 'var(--ds-typography-line-height-relaxed)',
        fontFamily: 'var(--ds-typography-font-family-mono)'
    }
];

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';
const SAMPLE_MONO = 'const api_key = "nango_live_abc123xyz";';

/** 'var(--ds-typography-font-size-4xl)' → '4xl' */
function tokenKey(cssVar: string): string {
    const match = cssVar.match(/-([^-)]+)\)$/);
    return match ? match[1] : cssVar;
}

function TypeRow({ scale }: { scale: TypeScale }) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr',
                gap: '16px',
                alignItems: 'baseline',
                padding: '12px 0',
                borderBottom: '1px solid var(--border-default)'
            }}
        >
            <div
                style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--ds-typography-font-family-mono)',
                    paddingTop: '2px'
                }}
            >
                <div>{scale.name}</div>
                <div style={{ marginTop: '4px', color: 'var(--text-disabled)', fontWeight: 400 }}>
                    {tokenKey(scale.fontSize)} / {tokenKey(scale.fontWeight)} / lh {tokenKey(scale.lineHeight)}
                    {scale.letterSpacing ? ` / ls ${tokenKey(scale.letterSpacing)}` : ''}
                </div>
            </div>
            <div
                style={{
                    fontSize: scale.fontSize,
                    fontWeight: scale.fontWeight,
                    lineHeight: scale.lineHeight,
                    letterSpacing: scale.letterSpacing,
                    fontFamily: scale.fontFamily ?? 'var(--ds-typography-font-family-sans)',
                    color: 'var(--text-strong)'
                }}
            >
                {scale.fontFamily ? SAMPLE_MONO : SAMPLE_TEXT}
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '48px' }}>
            <h2
                style={{
                    fontSize: 'var(--ds-typography-font-size-xs)',
                    fontWeight: 'var(--ds-typography-font-weight-semibold)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    margin: '0 0 12px 0',
                    fontFamily: 'var(--ds-typography-font-family-sans)'
                }}
            >
                {title}
            </h2>
            {children}
        </div>
    );
}

// ─── Stories ────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof meta>;

export const TypeScale: Story = {
    name: 'Type Scale',
    render: () => (
        <div style={{ maxWidth: '900px', padding: '32px' }}>
            <Section title="Geist Sans — Display &amp; Heading">
                {SANS_SCALE.filter((s) => s.name.startsWith('Display') || s.name.startsWith('Heading')).map((s) => (
                    <TypeRow key={s.name} scale={s} />
                ))}
            </Section>

            <Section title="Geist Sans — Body">
                {SANS_SCALE.filter((s) => s.name.startsWith('Body')).map((s) => (
                    <TypeRow key={s.name} scale={s} />
                ))}
            </Section>

            <Section title="Geist Sans — Label">
                {SANS_SCALE.filter((s) => s.name.startsWith('Label')).map((s) => (
                    <TypeRow key={s.name} scale={s} />
                ))}
            </Section>

            <Section title="Geist Mono — Code">
                {MONO_SCALE.map((s) => (
                    <TypeRow key={s.name} scale={s} />
                ))}
            </Section>
        </div>
    )
};

export const FontFamilies: Story = {
    name: 'Font Families',
    render: () => (
        <div style={{ maxWidth: '700px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
                <div
                    style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '12px',
                        fontFamily: 'var(--ds-typography-font-family-mono)'
                    }}
                >
                    Geist Sans — UI text
                </div>
                <div
                    style={{
                        fontSize: '28px',
                        fontFamily: 'var(--ds-typography-font-family-sans)',
                        color: 'var(--text-strong)',
                        lineHeight: 1.3
                    }}
                >
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ
                    <br />
                    abcdefghijklmnopqrstuvwxyz
                    <br />
                    0123456789 !@#$%^&amp;*()
                </div>
            </div>
            <div>
                <div
                    style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '12px',
                        fontFamily: 'var(--ds-typography-font-family-mono)'
                    }}
                >
                    Geist Mono — Code, IDs, API keys
                </div>
                <div
                    style={{
                        fontSize: '28px',
                        fontFamily: 'var(--ds-typography-font-family-mono)',
                        color: 'var(--text-strong)',
                        lineHeight: 1.3
                    }}
                >
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ
                    <br />
                    abcdefghijklmnopqrstuvwxyz
                    <br />
                    0123456789 !@#$%^&amp;*()
                </div>
            </div>
        </div>
    )
};
