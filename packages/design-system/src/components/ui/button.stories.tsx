import { ChevronRight, Plus } from 'lucide-react';

import { Button, IconButton } from './button';

import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';

const meta: Meta = {
    title: 'Design System/Components/Button',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link', 'link-danger'] as const;
const ICON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;
// IconButton supports 2xs (20px) through lg.
const ICON_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg'] as const;

const LINK_VARIANTS: (typeof VARIANTS)[number][] = ['link', 'link-danger'];
// Matches each size's own horizontal button padding (button.tsx), so the wrapped link text lines up with
// where a boxed button's text sits, not with the boxed button's outer edge.
const SIZE_PX: Record<(typeof SIZES)[number], string> = { xs: 'px-1.5', sm: 'px-2', md: 'px-2.5', lg: 'px-3' };

// link/link-danger collapse to the text's own line height and have no horizontal padding in real usage —
// pad them here in a wrapper, not via className on Button, purely so the story rows line up with the
// boxed variants' text, not just their outer edges.
const padLinkCell = (variant: (typeof VARIANTS)[number], node: ReactNode, size: (typeof SIZES)[number] = 'md'): ReactNode =>
    LINK_VARIANTS.includes(variant) ? <div className={`py-1.5 ${SIZE_PX[size]}`}>{node}</div> : node;

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div className="flex flex-col gap-10">
            {VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-6 flex-wrap">
                    <span className="text-ds-xs text-text-secondary w-28 shrink-0">{variant}</span>
                    {padLinkCell(variant, <Button variant={variant}>Default</Button>)}
                    {padLinkCell(
                        variant,
                        <Button variant={variant} disabled>
                            Disabled
                        </Button>
                    )}
                    {padLinkCell(
                        variant,
                        <Button variant={variant} loading>
                            Loading
                        </Button>
                    )}
                    {padLinkCell(
                        variant,
                        <Button variant={variant}>
                            <Plus />
                            With icon
                        </Button>
                    )}
                    {padLinkCell(
                        variant,
                        <Button variant={variant}>
                            Trailing
                            <ChevronRight />
                        </Button>
                    )}
                </div>
            ))}
        </div>
    )
};

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div className="flex flex-col gap-10">
            {SIZES.map((size) => (
                <div key={size} className="flex items-center gap-6">
                    <span className="text-ds-xs text-text-secondary w-12 shrink-0">{size}</span>
                    <Button size={size}>Button</Button>
                    <Button size={size} variant="outline">
                        Outline
                    </Button>
                    <Button size={size}>
                        <Plus />
                        With icon
                    </Button>
                    {padLinkCell(
                        'link',
                        <Button size={size} variant="link">
                            <ChevronRight />
                            Link
                        </Button>,
                        size
                    )}
                </div>
            ))}
        </div>
    )
};

export const IconButtonVariants: Story = {
    name: 'IconButton — all variants',
    render: () => (
        <div className="flex flex-col gap-10">
            {ICON_VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-6 flex-wrap">
                    <span className="text-ds-xs text-text-secondary w-20 shrink-0">{variant}</span>
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
        <div className="flex flex-col gap-10">
            {ICON_SIZES.map((size) => (
                <div key={size} className="flex items-center gap-6">
                    <span className="text-ds-xs text-text-secondary w-12 shrink-0">{size}</span>
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
