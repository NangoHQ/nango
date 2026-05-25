import * as LucideIcons from 'lucide-react';
import { useState } from 'react';

import { Icon } from './Icon';

import type { Meta, StoryObj } from '@storybook/react';
import type { LucideIcon } from 'lucide-react';

const meta: Meta = {
    title: 'Design System/Components/Icon',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// Canonical icon entries — exclude *Icon aliases and non-component exports
const ALL_ICONS = Object.entries(LucideIcons).filter(([name, value]) => /^[A-Z]/.test(name) && !name.endsWith('Icon') && typeof value === 'function') as [
    string,
    LucideIcon
][];

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export const Sizes: Story = {
    name: 'Sizes',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {SIZES.map((size) => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)' }}>
                    <span
                        style={{
                            fontSize: 'var(--ds-typography-font-size-xs)',
                            color: 'var(--text-secondary)',
                            width: '2rem',
                            flexShrink: 0
                        }}
                    >
                        {size}
                    </span>
                    <Icon icon={LucideIcons.Activity} size={size} className="text-[var(--icon-default)]" />
                    <Icon icon={LucideIcons.Settings} size={size} className="text-[var(--icon-default)]" />
                    <Icon icon={LucideIcons.Search} size={size} className="text-[var(--icon-default)]" />
                    <Icon icon={LucideIcons.Bell} size={size} className="text-[var(--icon-default)]" />
                    <Icon icon={LucideIcons.User} size={size} className="text-[var(--icon-default)]" />
                </div>
            ))}
        </div>
    )
};

function IconGrid() {
    const [query, setQuery] = useState('');

    const filtered = query.trim() ? ALL_ICONS.filter(([name]) => name.toLowerCase().includes(query.toLowerCase())) : ALL_ICONS;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-4)' }}>
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    paddingBlock: 'var(--ds-space-2)',
                    background: 'var(--surface-canvas)'
                }}
            >
                <input
                    type="search"
                    placeholder={`Search ${ALL_ICONS.length} icons…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{
                        width: '100%',
                        maxWidth: '20rem',
                        height: '2.125rem',
                        padding: '0 var(--ds-space-2-5)',
                        border: 'var(--ds-border-width-1) solid var(--input-border-default)',
                        borderRadius: 'var(--ds-radius-xs)',
                        background: 'var(--input-bg-default)',
                        color: 'var(--input-text-default)',
                        fontSize: 'var(--ds-typography-font-size-sm)',
                        outline: 'none'
                    }}
                />
                <p
                    style={{
                        marginTop: 'var(--ds-space-1)',
                        fontSize: 'var(--ds-typography-font-size-xs)',
                        color: 'var(--text-secondary)'
                    }}
                >
                    {filtered.length} icon{filtered.length !== 1 ? 's' : ''}
                    {query ? ` matching "${query}"` : ''}
                </p>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(5.5rem, 1fr))',
                    gap: 'var(--ds-space-2)'
                }}
            >
                {filtered.map(([name, IconComponent]) => (
                    <div
                        key={name}
                        title={name}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 'var(--ds-space-1-5)',
                            padding: 'var(--ds-space-3) var(--ds-space-2)',
                            borderRadius: 'var(--ds-radius-sm)',
                            border: 'var(--ds-border-width-1) solid var(--border-muted)',
                            cursor: 'default',
                            transition: 'background var(--ds-motion-duration-fast) var(--ds-motion-easing-standard)'
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'var(--state-hover)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = '')}
                    >
                        <Icon icon={IconComponent} size="md" className="text-[var(--icon-default)]" />
                        <span
                            style={{
                                fontSize: 'var(--ds-typography-font-size-2xs)',
                                color: 'var(--text-secondary)',
                                textAlign: 'center',
                                lineHeight: 'var(--ds-typography-line-height-snug)',
                                wordBreak: 'break-word'
                            }}
                        >
                            {name}
                        </span>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--ds-typography-font-size-sm)' }}>No icons match &ldquo;{query}&rdquo;</p>
            )}
        </div>
    );
}

export const AllIcons: Story = {
    name: 'All icons',
    render: () => <IconGrid />
};
