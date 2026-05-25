import { entries, isLeaf, tokens } from '../types';
import { capitalize } from './utils';

import type { TokenGroup } from '../types';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Typography',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Data ────────────────────────────────────────────────────────────────────

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

/** Recursively collect TypeEntry items from a typography token group, building the CSS class name from the token path. */
function collectEntries(group: TokenGroup, path: string[]): TypeEntry[] {
    return entries(group).flatMap(([k, node]) => {
        if (isLeaf(node)) {
            const className = 'type-' + [...path, k].join('-');
            const fontFamily = typeof node.$value === 'object' ? (node.$value.fontFamily ?? '') : '';
            return [{ className, label: [...path, k].join(' / '), description: DESCRIPTIONS[className], mono: fontFamily.toLowerCase().includes('mono') }];
        }
        return collectEntries(node, [...path, k]);
    });
}

const font = (e: TypeEntry[]) => (e[0]?.mono ? 'Geist Mono' : 'Geist Sans');

/**
 * Build display sections from the Typography token group.
 * Top-level groups with sub-groups (text, code) produce one section per sub-group.
 * Flat top-level groups (heading, label) produce a single section.
 * Section titles include the font name derived from the first entry's fontFamily.
 */
function buildSections(typoGroup: TokenGroup): { title: string; entries: TypeEntry[] }[] {
    return entries(typoGroup).flatMap(([groupName, groupValue]) => {
        if (isLeaf(groupValue)) return [];
        const children = entries(groupValue);
        const hasSubGroups = children.some(([, v]) => !isLeaf(v));

        // Groups like "text" and "code" have sub-groups (regular, medium) → one section per sub-group
        if (hasSubGroups) {
            return children
                .filter((e): e is [string, TokenGroup] => !isLeaf(e[1]))
                .flatMap(([subName, subValue]) => {
                    const sectionEntries = collectEntries(subValue, [groupName, subName]);
                    return sectionEntries.length
                        ? [{ title: `${font(sectionEntries)} — ${capitalize(groupName)} · ${capitalize(subName)}`, entries: sectionEntries }]
                        : [];
                });
        }

        // Flat groups like "heading" and "label" → one section
        const sectionEntries = collectEntries(groupValue, [groupName]);
        return sectionEntries.length ? [{ title: `${font(sectionEntries)} — ${capitalize(groupName)}`, entries: sectionEntries }] : [];
    });
}

const SECTIONS = buildSections(tokens.Typography);

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';
const SAMPLE_MONO = 'const api_key = "nango_live_abc123xyz";';

// ─── Stories ─────────────────────────────────────────────────────────────────

export const TypeScale: Story = {
    render: () => (
        <div className="p-8">
            {SECTIONS.map(({ title, entries: sectionEntries }) => (
                <div key={title} className="mb-12">
                    <h2 className="story-section-heading mb-3">{title}</h2>
                    {sectionEntries.map(({ className, label, description, mono }) => (
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
