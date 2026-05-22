import { Button } from './Button';
import { IconButton } from './IconButton';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Button',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link-danger'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;

function PlusIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 3v10M3 8h10" strokeLinecap="round" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-4)' }}>
            {VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-3)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '7rem', flexShrink: 0 }}>
                        {variant}
                    </span>
                    <Button variant={variant}>Default</Button>
                    <Button variant={variant} disabled>
                        Disabled
                    </Button>
                    <Button variant={variant} loading>
                        Loading
                    </Button>
                    <Button variant={variant} leadingIcon={<PlusIcon />}>
                        With icon
                    </Button>
                    <Button variant={variant} trailingIcon={<ChevronIcon />}>
                        Trailing
                    </Button>
                </div>
            ))}
        </div>
    )
};

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-4)' }}>
            {SIZES.map((size) => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-3)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '3rem', flexShrink: 0 }}>{size}</span>
                    <Button size={size}>Button</Button>
                    <Button size={size} variant="outline">
                        Outline
                    </Button>
                    <Button size={size} leadingIcon={<PlusIcon />}>
                        With icon
                    </Button>
                </div>
            ))}
        </div>
    )
};

const ICON_BUTTON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
const ICON_BUTTON_SIZES = ['xxs', 'xs', 'sm', 'md', 'lg'] as const;

export const IconButtonVariants: Story = {
    name: 'IconButton variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-4)' }}>
            {ICON_BUTTON_VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-3)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '5rem', flexShrink: 0 }}>
                        {variant}
                    </span>
                    {ICON_BUTTON_SIZES.map((size) => (
                        <IconButton key={size} variant={variant} size={size} label={`${variant} ${size}`}>
                            <PlusIcon />
                        </IconButton>
                    ))}
                    <IconButton variant={variant} disabled label={`${variant} disabled`}>
                        <PlusIcon />
                    </IconButton>
                    <IconButton variant={variant} loading label={`${variant} loading`} />
                </div>
            ))}
        </div>
    )
};
