import { ArrowUpRight, ChevronRight, Plus } from 'lucide-react';

import { LinkButton } from './link-button';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/LinkButton',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const TONES = ['accent', 'neutral', 'danger', 'info', 'success', 'warning'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

const SIZE_SPEC: Record<(typeof SIZES)[number], string> = {
    sm: '12 label · 12 icon',
    md: '13 label · 14 icon',
    lg: '14 label · 16 icon'
};

// Hover / Pressed / Focus are frozen with data-story-state, which .storybook/preview.css maps onto the real
// hover:/active:/focus-visible: variants — so each cell renders the component's own classes.
const STATES = [
    { label: 'Default', props: {} },
    { label: 'Hover', props: { 'data-story-state': 'hover' } },
    { label: 'Pressed', props: { 'data-story-state': 'active' } },
    { label: 'Focus', props: { 'data-story-state': 'focus-visible' } },
    { label: 'Disabled', props: { disabled: true } },
    { label: 'Loading', props: { loading: true } }
] as const;

const StateMatrix = ({ tone }: { tone: (typeof TONES)[number] }) => (
    <div className="grid grid-cols-[auto_repeat(6,max-content)] items-center gap-x-8 gap-y-6">
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
                        <LinkButton tone={tone} size={size} leftIcon={<Plus />} {...state.props}>
                            Link button
                        </LinkButton>
                    </div>
                ))}
            </div>
        ))}
    </div>
);

const matrixStory = (tone: (typeof TONES)[number]): Story => ({
    name: `${tone} — sizes × states`,
    render: () => <StateMatrix tone={tone} />
});

export const Accent = matrixStory('accent');
export const Neutral = matrixStory('neutral');
export const Danger = matrixStory('danger');
export const Info = matrixStory('info');
export const Success = matrixStory('success');
export const Warning = matrixStory('warning');

export const AllTonesAndSizes: Story = {
    name: 'All tones × sizes',
    render: () => (
        <div className="flex flex-col gap-10">
            {TONES.map((tone) => (
                <div key={tone} className="flex flex-col gap-3">
                    <span className="story-section-heading">{tone}</span>
                    {SIZES.map((size) => (
                        <div key={size} className="flex items-center gap-6">
                            <span className="text-ds-xs text-text-secondary w-8 shrink-0">{size}</span>
                            <LinkButton tone={tone} size={size}>
                                Label
                            </LinkButton>
                            <LinkButton tone={tone} size={size} leftIcon={<Plus />}>
                                Left icon
                            </LinkButton>
                            <LinkButton tone={tone} size={size} rightIcon={<ChevronRight />}>
                                Right icon
                            </LinkButton>
                            <LinkButton tone={tone} size={size} leftIcon={<Plus />} rightIcon={<ChevronRight />}>
                                Both icons
                            </LinkButton>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
};

// Loading never changes width. Each pair stacks resting over loading in a shrink-wrapped column with a
// dashed outline; matching right edges mean matching widths.
export const LoadingKeepsWidth: Story = {
    name: 'Loading keeps width',
    render: () => (
        <div className="flex flex-col gap-6">
            {SIZES.map((size) => (
                <div key={size} className="flex items-start gap-8">
                    <span className="text-ds-xs text-text-secondary w-8 shrink-0">{size}</span>
                    {[
                        { label: 'Left icon — spinner replaces it', leftIcon: <Plus /> },
                        { label: 'Label only — spinner overlays', leftIcon: undefined }
                    ].map((shape) => (
                        <div key={shape.label} className="flex flex-col items-start gap-2 outline outline-dashed outline-border-default">
                            <LinkButton tone="danger" size={size} leftIcon={shape.leftIcon}>
                                Delete integration
                            </LinkButton>
                            <LinkButton tone="danger" size={size} leftIcon={shape.leftIcon} loading>
                                Delete integration
                            </LinkButton>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
};

export const AsAnchor: Story = {
    name: 'asChild — anchor',
    render: () => (
        <p className="text-ds-sm text-text-secondary">
            Read the{' '}
            <LinkButton asChild rightIcon={<ArrowUpRight />}>
                <a href="https://docs.nango.dev" target="_blank" rel="noreferrer">
                    docs
                </a>
            </LinkButton>{' '}
            for details.
        </p>
    )
};
