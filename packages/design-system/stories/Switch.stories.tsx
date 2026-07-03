import { Switch } from '@/components/ui/Switch';
import { FieldLabel } from '../src/components/ui/field';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/UI/Switch',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
                <Switch id="sw-off" />
                <FieldLabel htmlFor="sw-off">Off</FieldLabel>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="sw-on" defaultChecked />
                <FieldLabel htmlFor="sw-on">On</FieldLabel>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="sw-disabled" disabled />
                <FieldLabel htmlFor="sw-disabled">Disabled</FieldLabel>
            </div>
        </div>
    )
};
