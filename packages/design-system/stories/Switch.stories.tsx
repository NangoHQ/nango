import { Label } from '@/components-v2/ui/Label';
import { Switch } from '@/components-v2/ui/Switch';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Switch',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
                <Switch id="sw-off" />
                <Label htmlFor="sw-off">Off</Label>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="sw-on" defaultChecked />
                <Label htmlFor="sw-on">On</Label>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="sw-disabled" disabled />
                <Label htmlFor="sw-disabled">Disabled</Label>
            </div>
        </div>
    )
};
