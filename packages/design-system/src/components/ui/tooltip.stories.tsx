import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Tooltip',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const ALIGNS = ['start', 'center', 'end'] as const;

const LONG_TEXT =
    'Records are written by the sync and kept in Nango until the connection is deleted. Nango stores the last known state of every record, so re-running a sync never duplicates them.';

// One trigger per row: an open tooltip needs the whole row to itself, or neighbours overlap it.
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex h-20 items-center justify-center">
        <Tooltip open>
            <TooltipTrigger asChild>
                <Button variant="secondary" size="md">
                    {label}
                </Button>
            </TooltipTrigger>
            {children}
        </Tooltip>
    </div>
);

/** Held open so the arrow placement is visible without hovering. */
export const Sides: Story = {
    render: () => (
        <div className="flex flex-col py-8">
            {SIDES.map((side) => (
                <Row key={side} label={side}>
                    <TooltipContent side={side}>Syncs data every 30 minutes</TooltipContent>
                </Row>
            ))}
        </div>
    )
};

/** `align` shifts the tooltip along the trigger's edge; the arrow stays on the trigger's centre. */
export const Alignment: Story = {
    render: () => (
        <div className="flex flex-col py-8">
            {ALIGNS.map((align) => (
                <Row key={align} label={`align=${align}`}>
                    <TooltipContent side="bottom" align={align}>
                        Syncs data every 30 minutes
                    </TooltipContent>
                </Row>
            ))}
        </div>
    )
};

/** Text wraps at the 384px cap. Anything longer belongs on the page, not in a tooltip. */
export const LongContent: Story = {
    render: () => (
        <div className="flex items-center justify-center py-40">
            <Tooltip open>
                <TooltipTrigger asChild>
                    <Button variant="secondary" size="md">
                        Long content
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{LONG_TEXT}</TooltipContent>
            </Tooltip>
        </div>
    )
};

/** No `open` forced — exercise it by hovering or tabbing to the trigger. */
export const OnHover: Story = {
    render: () => (
        <div className="flex items-center justify-center py-12">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="secondary" size="md">
                        Hover me
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Syncs data every 30 minutes</TooltipContent>
            </Tooltip>
        </div>
    )
};
