import { Switch } from '@/components/ui/Switch';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Switch',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-6">
            <div className="flex items-center gap-2">
                <Switch id="v1-sw-off" />
                <label htmlFor="v1-sw-off" className="text-white text-sm">Off</label>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="v1-sw-on" defaultChecked />
                <label htmlFor="v1-sw-on" className="text-white text-sm">On</label>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="v1-sw-disabled" disabled />
                <label htmlFor="v1-sw-disabled" className="text-white text-sm opacity-50">Disabled</label>
            </div>
        </div>
    )
};
