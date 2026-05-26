import { Button } from './button';
import { Tooltip, TooltipContent, TooltipKbd, TooltipProvider, TooltipTrigger } from './tooltip';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Tooltip',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <TooltipProvider>
                <Story />
            </TooltipProvider>
        )
    ]
};

export default meta;
type Story = StoryObj<typeof meta>;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export const Sides: Story = {
    name: 'Sides',
    render: () => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--ds-space-10)', padding: 'var(--ds-space-10)' }}>
            {SIDES.map((side) => (
                <Tooltip key={side} open>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="sm">
                            {side}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side={side}>This is a tooltip</TooltipContent>
                </Tooltip>
            ))}
        </div>
    )
};

export const WithKeyboardShortcut: Story = {
    name: 'With keyboard shortcut',
    render: () => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--ds-space-10)', padding: 'var(--ds-space-10)' }}>
            <Tooltip open>
                <TooltipTrigger asChild>
                    <Button variant="outline">Save</Button>
                </TooltipTrigger>
                <TooltipContent>
                    Save
                    <div style={{ display: 'flex', gap: 'var(--ds-space-1)' }}>
                        <TooltipKbd>⌘</TooltipKbd>
                        <TooltipKbd>S</TooltipKbd>
                    </div>
                </TooltipContent>
            </Tooltip>
            <Tooltip open>
                <TooltipTrigger asChild>
                    <Button variant="outline">Publish</Button>
                </TooltipTrigger>
                <TooltipContent>
                    Publish changes
                    <div style={{ display: 'flex', gap: 'var(--ds-space-1)' }}>
                        <TooltipKbd>⌘</TooltipKbd>
                        <TooltipKbd>⇧</TooltipKbd>
                        <TooltipKbd>P</TooltipKbd>
                    </div>
                </TooltipContent>
            </Tooltip>
        </div>
    )
};

export const Interactive: Story = {
    name: 'Interactive (hover to trigger)',
    render: () => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--ds-space-10)' }}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="secondary">Hover me</Button>
                </TooltipTrigger>
                <TooltipContent>This tooltip appears on hover</TooltipContent>
            </Tooltip>
        </div>
    )
};
