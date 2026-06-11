import { CheckIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useCallback, useState } from 'react';

import { Icon } from './icon';

import type { Meta, StoryObj } from '@storybook/react';
import type { LucideIcon } from 'lucide-react';

const meta: Meta = {
    title: 'Design System/Components/Icon',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// Canonical icon entries — exclude *Icon aliases and non-component exports.
// Icons in lucide-react v0.500+ are forwardRef objects (typeof === 'object'),
// so we accept both functions and non-null objects.
const ALL_ICONS = Object.entries(LucideIcons).filter(
    ([name, value]) =>
        /^[A-Z]/.test(name) &&
        !name.startsWith('Lucide') &&
        !name.endsWith('Icon') &&
        value != null &&
        (typeof value === 'function' || typeof value === 'object')
) as [string, LucideIcon][];

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
    const [copied, setCopied] = useState<string | null>(null);

    const filtered = query.trim() ? ALL_ICONS.filter(([name]) => name.toLowerCase().includes(query.toLowerCase())) : ALL_ICONS;

    const handleClick = useCallback((name: string) => {
        void navigator.clipboard.writeText(`<${name} />`).then(() => {
            setCopied(name);
            setTimeout(() => setCopied(null), 1500);
        });
    }, []);

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
                    className="max-w-80 h-8 w-full rounded px-2.5 text-sm border border-[var(--input-border-default)] bg-[var(--input-bg-default)] text-[var(--text-default)] placeholder:text-[var(--text-placeholder)] outline-none focus:border-[var(--input-border-focus)]"
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
                    gridTemplateColumns: 'repeat(auto-fill, minmax(3rem, 1fr))',
                    gap: 'var(--ds-space-1)'
                }}
            >
                {filtered.map(([name, IconComponent]) => (
                    <button
                        key={name}
                        title={copied === name ? 'Copied!' : `<${name} />`}
                        onClick={() => handleClick(name)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '3rem',
                            height: '3rem',
                            borderRadius: 'var(--ds-radius-sm)',
                            border: 'none',
                            background: copied === name ? 'var(--state-selected)' : 'transparent',
                            color: copied === name ? 'var(--icon-active)' : 'var(--icon-default)',
                            cursor: 'pointer',
                            transition:
                                'background var(--ds-motion-duration-fast) var(--ds-motion-easing-standard), color var(--ds-motion-duration-fast) var(--ds-motion-easing-standard)'
                        }}
                        onMouseEnter={(e) => {
                            if (copied !== name) (e.currentTarget as HTMLButtonElement).style.background = 'var(--state-hover)';
                        }}
                        onMouseLeave={(e) => {
                            if (copied !== name) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                    >
                        {copied === name ? <CheckIcon size={24} strokeWidth={2} /> : <IconComponent size={24} strokeWidth={2} />}
                    </button>
                ))}
            </div>

            {query.trim() && filtered.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--ds-typography-font-size-sm)' }}>No icons match &ldquo;{query}&rdquo;</p>
            )}
        </div>
    );
}

export const AllIcons: Story = {
    name: 'All icons',
    render: () => <IconGrid />
};
