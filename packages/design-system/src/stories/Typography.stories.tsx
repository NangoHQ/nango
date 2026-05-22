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
    },
    {
        name: 'Label · 3xs · medium',
        fontSize: 'var(--ds-typography-font-size-3xs)',
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
        <div className="grid grid-cols-[260px_1fr] gap-4 items-baseline py-3 border-b border-border-default">
            <div className="text-[11px] font-medium text-text-secondary font-mono pt-0.5">
                <div>{scale.name}</div>
                <div className="mt-1 font-normal whitespace-nowrap">
                    {tokenKey(scale.fontSize)} / {tokenKey(scale.fontWeight)} / lh {tokenKey(scale.lineHeight)}
                    {scale.letterSpacing ? ` / ls ${tokenKey(scale.letterSpacing)}` : ''}
                </div>
            </div>
            {/* Inline style intentional: this column renders the actual token values */}
            <div
                className="text-text-strong"
                style={{
                    fontSize: scale.fontSize,
                    fontWeight: scale.fontWeight,
                    lineHeight: scale.lineHeight,
                    letterSpacing: scale.letterSpacing,
                    fontFamily: scale.fontFamily ?? 'var(--ds-typography-font-family-sans)'
                }}
            >
                {scale.fontFamily ? SAMPLE_MONO : SAMPLE_TEXT}
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-12">
            <h2 className="story-section-heading mb-3">{title}</h2>
            {children}
        </div>
    );
}

// ─── Stories ────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof meta>;

export const TypeScale: Story = {
    name: 'Type Scale',
    render: () => (
        <div className="p-8">
            <div className="flex gap-2 items-start p-3 mb-8 rounded-lg border border-status-warning-border bg-status-warning-bg text-status-warning-text text-sm">
                <span>⚠️</span>
                <span>
                    <strong>Work in progress</strong> — these are the primitive typography tokens (individual font-size, weight, and line-height values).
                    Compound text styles (e.g. "Heading/xl") do not yet exist as tokens; they will be added once defined in Figma.
                </span>
            </div>
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
        <div className="max-w-[700px] p-8">
            <Section title="Geist Sans — UI text">
                <div className="text-[28px] font-sans text-text-strong leading-[1.5]">
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ
                    <br />
                    abcdefghijklmnopqrstuvwxyz
                    <br />
                    0123456789 !@#$%^&amp;*()
                </div>
            </Section>
            <Section title="Geist Mono — Code, IDs, API keys">
                <div className="text-[28px] font-mono text-text-strong leading-[1.5]">
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ
                    <br />
                    abcdefghijklmnopqrstuvwxyz
                    <br />
                    0123456789 !@#$%^&amp;*()
                </div>
            </Section>
        </div>
    )
};
