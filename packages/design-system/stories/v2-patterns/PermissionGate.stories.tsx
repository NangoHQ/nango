import { PermissionGate } from '@/components-v2/patterns/PermissionGate';
import { Button } from '@/components-v2/ui/Button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Patterns/PermissionGate',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-6">
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Allowed</span>
                <PermissionGate condition={true}>
                    {(allowed) => (
                        <Button variant="primary" size="sm" disabled={!allowed}>
                            Edit
                        </Button>
                    )}
                </PermissionGate>
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Denied (hover for tooltip)</span>
                <PermissionGate condition={false} message="You need admin role to edit this.">
                    {(allowed) => (
                        <Button variant="primary" size="sm" disabled={!allowed}>
                            Edit
                        </Button>
                    )}
                </PermissionGate>
            </div>
        </div>
    )
};
