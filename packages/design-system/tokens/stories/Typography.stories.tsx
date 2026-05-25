import tokensJson from '../tokens.json';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Typography',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Data ────────────────────────────────────────────────────────────────────

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

interface TypeEntry {
    className: string;
    label: string;
    description?: string;
    mono: boolean;
}

const DESCRIPTIONS: Record<string, string> = {
    'type-heading-lg': 'page headings, hero titles',
    'type-heading-md': 'section headings',
    'type-heading-sm': 'sub-section headings',
    'type-text-regular-md': 'standard body text',
    'type-text-regular-sm': 'dense body / tables',
    'type-text-regular-xs': 'small body / captions',
    'type-text-medium-md': 'emphasized body text',
    'type-text-medium-sm': 'emphasized dense body',
    'type-text-medium-xs': 'emphasized small body',
    'type-label-lg': 'form labels, prominent chips',
    'type-label-md': 'badges, table headers',
    'type-label-sm': 'metadata, helper text',
    'type-label-xs': 'tag content, inline status',
    'type-label-xxs': 'finest micro labels — use sparingly',
    'type-code-regular-sm': 'inline code, IDs, slugs',
    'type-code-regular-xs': 'small inline code',
    'type-code-regular-xxs': 'finest mono',
    'type-code-medium-md': 'emphasized code',
    'type-code-medium-sm': 'emphasized inline code',
    'type-code-medium-xs': 'emphasized small inline code',
    'type-code-medium-xxs': 'emphasized finest mono'
};

function collectEntries(obj: Record<string, unknown>, path: string[]): TypeEntry[] {
    return Object.entries(obj).flatMap(([k, v]) => {
        if (k.startsWith('$') || !v || typeof v !== 'object') return [];
        if ('$value' in v) {
            const className = 'type-' + [...path, k].join('-');
            const fontFamily = ((v as any).$value?.fontFamily ?? '') as string;
            return [{ className, label: [...path, k].join(' / '), description: DESCRIPTIONS[className], mono: fontFamily.toLowerCase().includes('mono') }];
        }
        return collectEntries(v as Record<string, unknown>, [...path, k]);
    });
}

const leaves = (obj: object) => Object.entries(obj).filter(([k]) => !k.startsWith('$'));
const font = (entries: TypeEntry[]) => (entries[0]?.mono ? 'Geist Mono' : 'Geist Sans');

function buildSections(typoGroup: Record<string, unknown>): { title: string; entries: TypeEntry[] }[] {
    return Object.entries(typoGroup).flatMap(([groupName, groupValue]) => {
        if (groupName.startsWith('$') || !groupValue || typeof groupValue !== 'object') return [];
        const children = leaves(groupValue);
        const hasSubGroups = children.some(([, v]) => typeof v === 'object' && !('$value' in (v as object)));

        // Groups like "text" and "code" have sub-groups (regular, medium) → one section per sub-group
        if (hasSubGroups) {
            return children
                .filter(([, v]) => typeof v === 'object')
                .flatMap(([subName, subValue]) => {
                    const entries = collectEntries(subValue as Record<string, unknown>, [groupName, subName]);
                    return entries.length ? [{ title: `${font(entries)} — ${capitalize(groupName)} · ${capitalize(subName)}`, entries }] : [];
                });
        }

        // Flat groups like "heading" and "label" → one section
        const entries = collectEntries(groupValue as Record<string, unknown>, [groupName]);
        return entries.length ? [{ title: `${font(entries)} — ${capitalize(groupName)}`, entries }] : [];
    });
}

const SECTIONS = buildSections((tokensJson as any)['Typography'] as Record<string, unknown>);

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
