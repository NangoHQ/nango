import { ConditionalTooltip } from '@/components-v2/patterns/ConditionalTooltip';
import { Button } from '@/components-v2/ui/Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ConditionalTooltip> = {
    component: ConditionalTooltip,
    title: 'Components v2/Patterns/ConditionalTooltip',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {
    render: () => (
        <ConditionalTooltip condition={true} content="You don't have permission to edit this." asChild>
            <Button variant="secondary" size="sm" disabled>
                Edit
            </Button>
        </ConditionalTooltip>
    )
};

export const Hidden: Story = {
    render: () => (
        <ConditionalTooltip condition={false} content="This tooltip is hidden.">
            <Button variant="secondary" size="sm">
                Edit
            </Button>
        </ConditionalTooltip>
    )
};
