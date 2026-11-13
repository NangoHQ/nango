import { SPLIT_BUTTON_SIZES, SPLIT_BUTTON_VARIANTS, SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from './split-button';

import type { SplitButtonSize, SplitButtonVariant } from './split-button';
import type { Meta, StoryObj } from '@storybook/react';

// The composed example with the app's DropdownMenu lives in stories/DeploySplitButton.stories.tsx — this package
// can't import webapp code from src/ (no `@` path in tsconfig), so these stories show the button on its own.

interface PlaygroundArgs {
    variant: SplitButtonVariant;
    size: SplitButtonSize;
    disabled: boolean;
    loading: boolean;
    children: string;
}

const meta: Meta<PlaygroundArgs> = {
    title: 'Design System/Components/SplitButton',
    parameters: { layout: 'padded' },
    argTypes: {
        variant: { control: 'select', options: SPLIT_BUTTON_VARIANTS },
        size: { control: 'select', options: SPLIT_BUTTON_SIZES }
    }
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
    args: { variant: 'primary', size: 'md', disabled: false, loading: false, children: 'Deploy' },
    render: ({ variant, size, disabled, loading, children }) => (
        <SplitButton variant={variant} size={size} disabled={disabled}>
            <SplitButtonAction loading={loading}>{children}</SplitButtonAction>
            <SplitButtonMenuTrigger label="More deploy options" />
        </SplitButton>
    )
};

// Hover / Pressed / Focus are frozen with data-story-state, which .storybook/preview.css maps onto the real
// hover:/active:/focus-visible: variants. Each column targets one half, to show the halves keep separate states.
interface HalfState {
    label: string;
    group?: { disabled?: boolean };
    action?: Record<string, unknown>;
    trigger?: Record<string, unknown>;
}

const STATES: HalfState[] = [
    { label: 'Default' },
    { label: 'Hover main', action: { 'data-story-state': 'hover' } },
    { label: 'Hover menu', trigger: { 'data-story-state': 'hover' } },
    { label: 'Pressed main', action: { 'data-story-state': 'active' } },
    { label: 'Focus main', action: { 'data-story-state': 'focus-visible' } },
    { label: 'Focus menu', trigger: { 'data-story-state': 'focus-visible' } },
    { label: 'Menu open', trigger: { 'aria-expanded': true } },
    { label: 'Disabled', group: { disabled: true } },
    { label: 'Loading', action: { loading: true } }
];

const SIZE_SPEC: Record<SplitButtonSize, string> = {
    xs: '24 · icon 12',
    sm: '28 · icon 14',
    md: '32 · icon 16',
    lg: '36 · icon 16'
};

// Rows = sizes, columns = states.
const StateMatrix = ({ variant }: { variant: SplitButtonVariant }) => (
    <div className="grid grid-cols-[auto_repeat(9,max-content)] items-center gap-x-8 gap-y-6">
        <span />
        {STATES.map((state) => (
            <span key={state.label} className="story-section-heading">
                {state.label}
            </span>
        ))}
        {SPLIT_BUTTON_SIZES.map((size) => (
            <div key={size} className="contents">
                <span className="flex flex-col text-ds-xs text-text-secondary pr-4">
                    <span className="text-text-strong font-ds-medium">{size}</span>
                    <span>{SIZE_SPEC[size]}</span>
                </span>
                {STATES.map((state) => (
                    <div key={state.label}>
                        <SplitButton variant={variant} size={size} {...state.group}>
                            <SplitButtonAction {...state.action}>Deploy</SplitButtonAction>
                            <SplitButtonMenuTrigger label={`More deploy options (${variant}, ${size}, ${state.label})`} {...state.trigger} />
                        </SplitButton>
                    </div>
                ))}
            </div>
        ))}
    </div>
);

// One story per type × theme. `globals.theme` pins the Themes toolbar, so light and dark are both captured.
const matrixStory = (variant: SplitButtonVariant, theme: 'light' | 'dark'): Story => ({
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
