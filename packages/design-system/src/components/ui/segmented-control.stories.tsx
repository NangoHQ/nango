import { KeyRound, Lock, Monitor, Moon, PencilRuler, Search, SunMedium } from 'lucide-react';
import { useState } from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';
import { SegmentedControl, SegmentedControlItem } from './segmented-control';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SegmentedControl> = {
    title: 'Design System/Components/SegmentedControl',
    component: SegmentedControl,
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const SIZES = ['md', 'sm'] as const;
const STATES = ['Default', 'Hover', 'Focus', 'Disabled'] as const;
type State = (typeof STATES)[number];

// Hover and focus can't be frozen with props, so the matrix forces their classes. Stories only — consumers never pass className.
const FORCED: Record<State, string | undefined> = {
    Default: undefined,
    Hover: 'pointer-events-none text-text-default',
    Focus: 'pointer-events-none shadow-focus-outline-default data-selected:shadow-focus-outline-default',
    Disabled: undefined
};

const FIGMA_ITEMS = ['All', 'Syncs', 'Actions', 'Webhooks'];

/** One item per cell, on its track, for every Selected × State × Size × Content (Figma 2621:197). */
export const ItemMatrix: Story = {
    render: () => (
        <div className="flex flex-col gap-6">
            {SIZES.map((size) => (
                <div key={size} className="flex flex-col gap-3">
                    <span className="story-section-heading">Size {size}</span>
                    <div className="grid grid-cols-[136px_repeat(3,auto)] items-center gap-x-6 gap-y-3 justify-start">
                        <span />
                        {['Text', 'Text + icon', 'Icon'].map((heading) => (
                            <span key={heading} className="story-section-heading">
                                {heading}
                            </span>
                        ))}
                        {[false, true].flatMap((selected) =>
                            STATES.map((state) => <ItemMatrixRow key={`${selected}-${state}`} size={size} selected={selected} state={state} />)
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
};

const ItemMatrixRow: React.FC<{ size: 'md' | 'sm'; selected: boolean; state: State }> = ({ size, selected, state }) => {
    const value = selected ? 'item' : 'other';
    const itemProps = { value: 'item', disabled: state === 'Disabled', className: FORCED[state] };
    return (
        <>
            <span className="text-ds-xs text-text-secondary">
                {selected ? 'Selected' : 'Unselected'} · {state}
            </span>
            <SegmentedControl size={size} aria-label="Text" value={value}>
                <SegmentedControlItem {...itemProps}>Syncs</SegmentedControlItem>
            </SegmentedControl>
            <SegmentedControl size={size} aria-label="Text and icon" value={value}>
                <SegmentedControlItem {...itemProps} icon={<Monitor />}>
                    Syncs
                </SegmentedControlItem>
            </SegmentedControl>
            <SegmentedControl size={size} aria-label="Icon" value={value}>
                <SegmentedControlItem {...itemProps} icon={<Monitor />} aria-label="System theme" />
            </SegmentedControl>
        </>
    );
};

/** 2, 3 and 4 items at md and sm (Figma 2621:280). Click, or Tab in and use the arrow keys. */
export const ItemCounts: Story = {
    render: () => (
        <div className="flex flex-col gap-6">
            {SIZES.map((size) => (
                <div key={size} className="flex flex-col gap-3">
                    <span className="story-section-heading">Size {size}</span>
                    <div className="flex flex-wrap items-center gap-6">
                        {[2, 3, 4].map((count) => (
                            <SegmentedControl key={count} size={size} aria-label={`${count} items`} defaultValue="All">
                                {FIGMA_ITEMS.slice(0, count).map((label) => (
                                    <SegmentedControlItem key={label} value={label}>
                                        {label}
                                    </SegmentedControlItem>
                                ))}
                            </SegmentedControl>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};

export const WithIcons: Story = {
    render: () => (
        <div className="flex flex-col gap-4">
            {SIZES.map((size) => (
                <SegmentedControl key={size} size={size} aria-label="Access" defaultValue="full">
                    <SegmentedControlItem value="full" icon={<KeyRound />}>
                        Full access
                    </SegmentedControlItem>
                    <SegmentedControlItem value="read" icon={<Lock />}>
                        Read only
                    </SegmentedControlItem>
                    <SegmentedControlItem value="custom" icon={<PencilRuler />}>
                        Custom
                    </SegmentedControlItem>
                </SegmentedControl>
            ))}
        </div>
    )
};

/** Square items, each with an aria-label shown as its tooltip. */
export const IconOnly: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            {SIZES.map((size) => (
                <ThemeSwitcherDemo key={size} size={size} />
            ))}
        </div>
    )
};

export const Disabled: Story = {
    render: () => (
        <div className="flex flex-col gap-4">
            <SegmentedControl aria-label="Whole control disabled" defaultValue="All" disabled>
                {FIGMA_ITEMS.slice(0, 3).map((label) => (
                    <SegmentedControlItem key={label} value={label}>
                        {label}
                    </SegmentedControlItem>
                ))}
            </SegmentedControl>
            <SegmentedControl aria-label="One item disabled" defaultValue="All">
                {FIGMA_ITEMS.slice(0, 3).map((label) => (
                    <SegmentedControlItem key={label} value={label} disabled={label === 'Actions'}>
                        {label}
                    </SegmentedControlItem>
                ))}
            </SegmentedControl>
        </div>
    )
};

const ThemeSwitcherDemo: React.FC<{ size?: 'md' | 'sm' }> = ({ size = 'sm' }) => {
    const [theme, setTheme] = useState('system');
    return (
        <SegmentedControl size={size} aria-label="Theme" value={theme} onValueChange={setTheme}>
            <SegmentedControlItem value="light" aria-label="Light theme" icon={<SunMedium />} />
            <SegmentedControlItem value="dark" aria-label="Dark theme" icon={<Moon />} />
            <SegmentedControlItem value="system" aria-label="System theme" icon={<Monitor />} />
        </SegmentedControl>
    );
};

/** The Profile menu theme switcher (Figma 2509:1948): sm, three icon items, System by default. */
export const ThemeSwitcher: Story = {
    render: () => (
        <div className="flex h-9 w-58 items-center gap-2 rounded-ds-sm border-ds-1 border-border-default bg-surface-panel pr-1 pl-2">
            <span className="flex-1 text-ds-sm text-text-default">Theme</span>
            <ThemeSwitcherDemo />
        </div>
    )
};

/** Filter next to a search field: both md, 32px, so they line up in a toolbar. */
export const WithSearch: Story = {
    name: 'Composed: filter + search',
    render: () => (
        <div className="flex items-center gap-2">
            <SegmentedControl aria-label="Function type" defaultValue="all">
                <SegmentedControlItem value="all">All</SegmentedControlItem>
                <SegmentedControlItem value="syncs">Syncs</SegmentedControlItem>
                <SegmentedControlItem value="actions">Actions</SegmentedControlItem>
            </SegmentedControl>
            <div className="w-64">
                <InputGroup>
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Search functions…" />
                </InputGroup>
            </div>
        </div>
    )
};

/** API key access preset in a settings row. */
export const AccessPreset: Story = {
    name: 'Composed: access preset',
    render: () => <AccessPresetDemo />
};

const AccessPresetDemo: React.FC = () => {
    const [access, setAccess] = useState('full');
    return (
        <div className="flex w-[560px] items-center gap-8">
            <span className="w-[220px] shrink-0 text-ds-sm font-ds-medium text-text-default">Access</span>
            <SegmentedControl aria-label="Access" value={access} onValueChange={setAccess}>
                <SegmentedControlItem value="full">Full access</SegmentedControlItem>
                <SegmentedControlItem value="read">Read only</SegmentedControlItem>
                <SegmentedControlItem value="custom">Custom</SegmentedControlItem>
            </SegmentedControl>
        </div>
    );
};
