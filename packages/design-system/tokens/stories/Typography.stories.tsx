import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Typography',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Data ─────────────────────────────────────────────────────────────────────

interface TypeEntry {
    className: string;
    label: string;
    description: string;
    mono: boolean;
}

const SECTIONS: { title: string; entries: TypeEntry[] }[] = [
    {
        title: 'Geist Sans — Heading',
        entries: [
            { className: 'type-heading-lg', label: 'heading / lg', description: 'page headings, hero titles', mono: false },
            { className: 'type-heading-md', label: 'heading / md', description: 'section headings', mono: false },
            { className: 'type-heading-sm', label: 'heading / sm', description: 'sub-section headings', mono: false }
        ]
    },
    {
        title: 'Geist Sans — Text · Regular',
        entries: [
            { className: 'type-text-regular-md', label: 'text / regular / md', description: 'standard body text', mono: false },
            { className: 'type-text-regular-sm', label: 'text / regular / sm', description: 'dense body / tables', mono: false },
            { className: 'type-text-regular-xs', label: 'text / regular / xs', description: 'small body / captions', mono: false }
        ]
    },
    {
        title: 'Geist Sans — Text · Medium',
        entries: [
            { className: 'type-text-medium-md', label: 'text / medium / md', description: 'emphasized body text', mono: false },
            { className: 'type-text-medium-sm', label: 'text / medium / sm', description: 'emphasized dense body', mono: false },
            { className: 'type-text-medium-xs', label: 'text / medium / xs', description: 'emphasized small body', mono: false }
        ]
    },
    {
        title: 'Geist Sans — Label',
        entries: [
            { className: 'type-label-lg', label: 'label / lg', description: 'form labels, prominent chips', mono: false },
            { className: 'type-label-md', label: 'label / md', description: 'badges, table headers', mono: false },
            { className: 'type-label-sm', label: 'label / sm', description: 'metadata, helper text', mono: false },
            { className: 'type-label-xs', label: 'label / xs', description: 'tag content, inline status', mono: false },
            { className: 'type-label-xxs', label: 'label / xxs', description: 'finest micro labels — use sparingly', mono: false }
        ]
    },
    {
        title: 'Geist Mono — Code · Regular',
        entries: [
            { className: 'type-code-regular-sm', label: 'code / regular / sm', description: 'inline code, IDs, slugs', mono: true },
            { className: 'type-code-regular-xs', label: 'code / regular / xs', description: 'small inline code', mono: true },
            { className: 'type-code-regular-xxs', label: 'code / regular / xxs', description: 'finest mono', mono: true }
        ]
    },
    {
        title: 'Geist Mono — Code · Medium',
        entries: [
            { className: 'type-code-medium-md', label: 'code / medium / md', description: 'emphasized code', mono: true },
            { className: 'type-code-medium-sm', label: 'code / medium / sm', description: 'emphasized inline code', mono: true },
            { className: 'type-code-medium-xs', label: 'code / medium / xs', description: 'emphasized small inline code', mono: true },
            { className: 'type-code-medium-xxs', label: 'code / medium / xxs', description: 'emphasized finest mono', mono: true }
        ]
    }
];

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';
const SAMPLE_MONO = 'const api_key = "nango_live_abc123xyz";';

// ─── Stories ─────────────────────────────────────────────────────────────────

export const TypeScale: Story = {
    render: () => (
        <div className="p-8">
            {SECTIONS.map(({ title, entries }) => (
                <div key={title} className="mb-12">
                    <h2 className="story-section-heading mb-3">{title}</h2>
                    {entries.map(({ className, label, description, mono }) => (
                        <div key={className} className="grid grid-cols-[260px_1fr] gap-4 items-baseline py-3 border-b border-border-default">
                            <div className="text-[11px] font-mono pt-0.5">
                                <div className="font-medium text-text-secondary">{label}</div>
                                {description && <div className="mt-1 font-normal text-text-muted">{description}</div>}
                            </div>
                            <span className={`text-text-strong ${className}`}>{mono ? SAMPLE_MONO : SAMPLE_TEXT}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
};

export const FontFamilies: Story = {
    render: () => (
        <div className="max-w-[700px] p-8">
            {[
                { label: 'Geist Sans — UI text', className: 'font-sans' },
                { label: 'Geist Mono — Code, IDs, API keys', className: 'font-mono' }
            ].map(({ label, className }) => (
                <div key={label} className="mb-12">
                    <h2 className="story-section-heading mb-3">{label}</h2>
                    <div className={`text-[28px] ${className} text-text-strong leading-[1.5]`}>
                        ABCDEFGHIJKLMNOPQRSTUVWXYZ
                        <br />
                        abcdefghijklmnopqrstuvwxyz
                        <br />
                        0123456789 !@#$%^&amp;*()
                    </div>
                </div>
            ))}
        </div>
    )
};
