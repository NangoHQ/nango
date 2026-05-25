import { entries, isLeaf, tokens } from '../types';
import { capitalize, isFlatGroup, leaves } from './utils';

import type { TokenGroup, TokenLeaf } from '../types';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Typography',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog';
const SAMPLE_MONO = 'const api_key = "nango_live_abc123xyz";';

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

interface TypeEntry {
    className: string;
    label: string;
    description?: string;
    mono: boolean;
}

function toEntry(path: string[], leaf: TokenLeaf): TypeEntry {
    const className = 'type-' + path.join('-');
    const fontFamily = typeof leaf.$value === 'object' ? (leaf.$value.fontFamily ?? '') : '';
    return {
        className,
        label: path.join(' / '),
        description: DESCRIPTIONS[className],
        mono: fontFamily.toLowerCase().includes('mono')
    };
}

const fontName = (e: TypeEntry) => (e.mono ? 'Geist Mono' : 'Geist Sans');

/**
 * Top-level typography groups are either flat (heading, label → one section)
 * or contain subgroups (text, code → one section per subgroup).
 */
function buildSections(): { title: string; entries: TypeEntry[] }[] {
    return entries(tokens.Typography).flatMap(([name, group]) => {
        if (isLeaf(group)) return [];

        const sectionsFor = (path: string[], subGroup: TokenGroup, displayName: string) => {
            const items = [...leaves(subGroup, path)].map(({ path: p, leaf }) => toEntry(p, leaf));
            return items.length ? [{ title: `${fontName(items[0])} — ${displayName}`, entries: items }] : [];
        };

        if (isFlatGroup(group)) {
            return sectionsFor([name], group, capitalize(name));
        }

        return entries(group).flatMap(([subName, subGroup]) => {
            if (isLeaf(subGroup)) return [];
            return sectionsFor([name, subName], subGroup, `${capitalize(name)} · ${capitalize(subName)}`);
        });
    });
}

const SECTIONS = buildSections();

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
