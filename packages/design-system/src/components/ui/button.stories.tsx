import { Plus } from 'lucide-react';

import { Button, IconButton } from './button';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Button',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link-accent', 'link-danger', 'link-neutral', 'link-neutral-danger'] as const;
const ICON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg'] as const;
// IconButton supports 2xs (20px) through lg.
const ICON_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg'] as const;

type Variant = (typeof VARIANTS)[number];

// .storybook/preview.css maps data-story-state onto the real hover:/active:/focus-visible: variants.
const STATES = [
    { label: 'Default', props: {} },
    { label: 'Hover', props: { 'data-story-state': 'hover' } },
    { label: 'Pressed', props: { 'data-story-state': 'active' } },
    { label: 'Focus', props: { 'data-story-state': 'focus-visible' } },
    { label: 'Disabled', props: { disabled: true } },
    { label: 'Loading', props: { loading: true } }
] as const;

const SIZE_SPEC: Record<(typeof SIZES)[number], string> = {
    xs: '24 · px 8 · 12/12 · gap 4',
    sm: '28 · px 10 · 12/14 · gap 6',
    md: '32 · px 12 · 13/16 · gap 6',
    lg: '36 · px 14 · 14/16 · gap 8'
};

const StateMatrix = ({ variant }: { variant: Variant }) => (
    <div className="grid grid-cols-[max-content_repeat(6,max-content)] items-center gap-x-8 gap-y-6">
        <span />
        {STATES.map((state) => (
            <span key={state.label} className="story-section-heading">
                {state.label}
            </span>
        ))}
        {SIZES.map((size) => (
            <div key={size} className="contents">
                <span className="flex flex-col text-ds-xs text-text-secondary pr-4">
                    <span className="text-text-strong font-ds-medium">{size}</span>
                    <span>{SIZE_SPEC[size]}</span>
                </span>
                {STATES.map((state) => (
                    <div key={state.label}>
                        <Button variant={variant} size={size} {...state.props}>
                            <Plus />
                            Button
                        </Button>
                    </div>
                ))}
            </div>
        ))}
    </div>
);

const matrixStory = (variant: Variant): Story => ({
    name: `${variant} — sizes × states`,
    render: () => <StateMatrix variant={variant} />
});

export const Primary = matrixStory('primary');
export const Secondary = matrixStory('secondary');
export const Outline = matrixStory('outline');
export const Ghost = matrixStory('ghost');
export const Danger = matrixStory('danger');
export const LinkAccent = matrixStory('link-accent');
export const LinkDanger = matrixStory('link-danger');
export const LinkNeutral = matrixStory('link-neutral');
export const LinkNeutralDanger = matrixStory('link-neutral-danger');

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
