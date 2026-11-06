import { Plus } from 'lucide-react';

import { ICON_BUTTON_SIZES, IconButton } from './button';

import type { IconButtonSize, IconButtonVariant } from './button';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/IconButton',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// .storybook/preview.css maps data-story-state onto the real hover:/active:/focus-visible: variants.
const STATES = [
    { label: 'Default', props: {} },
    { label: 'Hover', props: { 'data-story-state': 'hover' } },
    { label: 'Pressed', props: { 'data-story-state': 'active' } },
    { label: 'Focus', props: { 'data-story-state': 'focus-visible' } },
    { label: 'Disabled', props: { disabled: true } },
    { label: 'Loading', props: { loading: true } }
] as const;

type StorySize = IconButtonSize | '2xs';

const SIZE_SPEC: Record<StorySize, string> = {
    '2xs': '20 · icon 16',
    xs: '24 · icon 12',
    sm: '28 · icon 14',
    md: '32 · icon 16',
    lg: '36 · icon 16'
};

const StateMatrix = ({ variant, sizes }: { variant: IconButtonVariant; sizes: readonly StorySize[] }) => (
    <div className="grid grid-cols-[max-content_repeat(6,max-content)] items-center gap-x-8 gap-y-6">
        <span />
        {STATES.map((state) => (
            <span key={state.label} className="story-section-heading">
                {state.label}
            </span>
        ))}
        {sizes.map((size) => (
            <div key={size} className="contents">
                <span className="flex flex-col text-ds-xs text-text-secondary pr-4">
                    <span className="text-text-strong font-ds-medium">{size}</span>
                    <span>{SIZE_SPEC[size]}</span>
                </span>
                {STATES.map((state) => (
                    <div key={state.label}>
                        <IconButton variant={variant} size={size} label={`Add item (${variant}, ${size}, ${state.label})`} {...state.props}>
                            <Plus />
                        </IconButton>
                    </div>
                ))}
            </div>
        ))}
    </div>
);

const matrixStory = (variant: IconButtonVariant, sizes: readonly StorySize[] = ICON_BUTTON_SIZES): Story => ({
    name: `${variant} — sizes × states`,
    render: () => <StateMatrix variant={variant} sizes={sizes} />
});

export const Primary = matrixStory('primary');
export const Secondary = matrixStory('secondary');
export const Outline = matrixStory('outline');
export const Ghost = matrixStory('ghost', ['2xs', ...ICON_BUTTON_SIZES]);
export const Danger = matrixStory('danger');
