import { Plus } from 'lucide-react';

import { ICON_BUTTON_SIZES, ICON_BUTTON_VARIANTS, IconButton } from './button';

import type { IconButtonSize, IconButtonVariant } from './button';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof IconButton> = {
    title: 'Design System/Components/IconButton',
    component: IconButton,
    parameters: { layout: 'padded' },
    argTypes: {
        variant: { control: 'select', options: ICON_BUTTON_VARIANTS },
        size: { control: 'select', options: ICON_BUTTON_SIZES }
    }
};

export default meta;
type Story = StoryObj<typeof meta>;

// Hover / Pressed / Focus are frozen with data-story-state, which .storybook/preview.css maps onto the real
// hover:/active:/focus-visible: variants — so each cell renders the component's own classes, not a copy.
const STATES = [
    { label: 'Default', props: {} },
    { label: 'Hover', props: { 'data-story-state': 'hover' } },
    { label: 'Pressed', props: { 'data-story-state': 'active' } },
    { label: 'Focus', props: { 'data-story-state': 'focus-visible' } },
    { label: 'Disabled', props: { disabled: true } },
    { label: 'Loading', props: { loading: true } }
] as const;

const SIZE_SPEC: Record<IconButtonSize, string> = {
    xs: '24 · icon 12',
    sm: '28 · icon 14',
    md: '32 · icon 16',
    lg: '36 · icon 16'
};

export const Playground: Story = {
    args: { variant: 'primary', size: 'md', label: 'Add item', children: <Plus /> }
};

const StateMatrix = ({ variant }: { variant: IconButtonVariant }) => (
    <div className="grid grid-cols-[max-content_repeat(6,max-content)] items-center gap-x-8 gap-y-6">
        <span />
        {STATES.map((state) => (
            <span key={state.label} className="story-section-heading">
                {state.label}
            </span>
        ))}
        {ICON_BUTTON_SIZES.map((size) => (
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

// One story per type × theme. `globals.theme` pins the Themes toolbar, so light and dark are both captured
// without toggling.
const matrixStory = (variant: IconButtonVariant, theme: 'light' | 'dark'): Story => ({
    name: `${variant} — ${theme}`,
    globals: { theme },
    render: () => <StateMatrix variant={variant} />
});

export const PrimaryLight = matrixStory('primary', 'light');
export const PrimaryDark = matrixStory('primary', 'dark');
export const SecondaryLight = matrixStory('secondary', 'light');
export const SecondaryDark = matrixStory('secondary', 'dark');
export const OutlineLight = matrixStory('outline', 'light');
export const OutlineDark = matrixStory('outline', 'dark');
export const GhostLight = matrixStory('ghost', 'light');
export const GhostDark = matrixStory('ghost', 'dark');
export const DangerLight = matrixStory('danger', 'light');
export const DangerDark = matrixStory('danger', 'dark');
