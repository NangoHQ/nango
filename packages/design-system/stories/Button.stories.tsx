import { ChevronRight, Plus } from 'lucide-react';

import { Button, IconButton } from '../src/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Button',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link-danger'] as const;
const ICON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
// 'xl' (40px) is a deprecated migration-only size (flagged in the "All sizes" story).
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
// IconButton supports 2xs (20px) through lg; xl is not offered for icon buttons.
const ICON_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg'] as const;

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
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
                    <Button variant={variant}>
                        <Plus />
                        With icon
                    </Button>
                    <Button variant={variant}>
                        Trailing
                        <ChevronRight />
                    </Button>
                </div>
            ))}
        </div>
    )
};

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            <Alert variant="warning" className="max-w-2xl">
                <AlertTitle>xl is deprecated</AlertTitle>
                <AlertDescription>xl (40px) exists only to migrate legacy 40px webapp buttons. Use lg for new buttons.</AlertDescription>
            </Alert>
            {SIZES.map((size) => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '3rem', flexShrink: 0 }}>{size}</span>
                    <Button size={size}>Button</Button>
                    <Button size={size} variant="outline">
                        Outline
                    </Button>
                    <Button size={size}>
                        <Plus />
                        With icon
                    </Button>
                </div>
            ))}
        </div>
    )
};

export const IconButtonVariants: Story = {
    name: 'IconButton — all variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {ICON_VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '5rem', flexShrink: 0 }}>
                        {variant}
                    </span>
                    <IconButton variant={variant} label={`${variant} default`}>
                        <Plus />
                    </IconButton>
                    <IconButton variant={variant} disabled label={`${variant} disabled`}>
                        <Plus />
                    </IconButton>
                    <IconButton variant={variant} loading label={`${variant} loading`} />
                </div>
            ))}
        </div>
    )
};

export const IconButtonSizes: Story = {
    name: 'IconButton — all sizes',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {ICON_SIZES.map((size) => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '3rem', flexShrink: 0 }}>{size}</span>
                    <IconButton size={size} label={`${size} primary`}>
                        <Plus />
                    </IconButton>
                    <IconButton size={size} variant="outline" label={`${size} outline`}>
                        <Plus />
                    </IconButton>
                    <IconButton size={size} variant="ghost" label={`${size} ghost`}>
                        <Plus />
                    </IconButton>
                </div>
            ))}
        </div>
    )
};
