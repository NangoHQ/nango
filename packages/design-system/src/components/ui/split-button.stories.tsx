import { SPLIT_BUTTON_SIZES, SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from './split-button';

import type { SplitButtonSize, SplitButtonVariant } from './split-button';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Buttons/SplitButton',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// .storybook/preview.css maps data-story-state onto the real hover:/active:/focus-visible: variants.
// Each column targets one half, to show the halves keep separate states.
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
    { label: 'Disabled', group: { disabled: true } },
    { label: 'Loading', action: { loading: true } }
];

const SIZE_SPEC: Record<SplitButtonSize, string> = {
    xs: '24 · icon 12',
    sm: '28 · icon 14',
    md: '32 · icon 16',
    lg: '36 · icon 16'
};

const StateMatrix = ({ variant }: { variant: SplitButtonVariant }) => (
    <div className="grid items-center gap-x-8 gap-y-6" style={{ gridTemplateColumns: `max-content repeat(${STATES.length}, max-content)` }}>
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

const matrixStory = (variant: SplitButtonVariant): Story => ({
    name: `${variant} — sizes × states`,
    render: () => <StateMatrix variant={variant} />
});

export const Primary = matrixStory('primary');
export const Secondary = matrixStory('secondary');
export const Outline = matrixStory('outline');
