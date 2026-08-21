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

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link-accent', 'link-danger', 'link-neutral'] as const;
const ICON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;
// IconButton supports 2xs (20px) through lg.
const ICON_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg'] as const;

const LINK_VARIANTS: (typeof VARIANTS)[number][] = ['link-accent', 'link-danger', 'link-neutral'];
// Matches each size's own box height/horizontal padding from button.tsx (h-6/px-1.5 for xs, etc.), so the
// wrapped link text lines up with where a boxed button's text sits — both horizontally and vertically.
const SIZE_BOX: Record<(typeof SIZES)[number], string> = {
    xs: 'h-6 px-1.5',
    sm: 'h-7 px-2',
    md: 'h-8 px-2.5',
    lg: 'h-9 px-3'
};
// link-danger's own Button already carries px-0.5 (Figma's space/0_5, see button.tsx). Using SIZE_BOX
// unmodified would double that padding on top of the wrapper's, widening every link-danger cell by 4px
// and compounding across the row's gap. Subtract it here so both variants' wrappers land at the same width.
const SIZE_BOX_LINK_DANGER: Record<(typeof SIZES)[number], string> = {
    xs: 'h-6 px-1',
    sm: 'h-7 px-1.5',
    md: 'h-8 px-2',
    lg: 'h-9 px-2.5'
};

// link/link-danger collapse to the text's own line height and have no box in real usage. A fixed-height
// flex wrapper here (not className on Button, and not padding alone) guarantees every cell in a row gets
// the exact same height regardless of its content (plain text vs. an icon vs. the loading spinner), so
// nothing can drift depending on what's inside — purely a story-layout concern, not a component change.
const padLinkCell = (variant: (typeof VARIANTS)[number], node: ReactNode, size: (typeof SIZES)[number] = 'md'): ReactNode => {
    if (!LINK_VARIANTS.includes(variant)) return node;
    const box = variant === 'link-danger' ? SIZE_BOX_LINK_DANGER[size] : SIZE_BOX[size];
    return <div className={`flex items-center ${box}`}>{node}</div>;
};

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
                        'link-accent',
                        <Button size={size} variant="link-accent">
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
