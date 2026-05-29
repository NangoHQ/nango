import { Checkbox } from '@/components-v2/ui/Checkbox';
import { Label } from '@/components-v2/ui/Label';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/Checkbox',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
                <Checkbox id="cb-unchecked" />
                <Label htmlFor="cb-unchecked">Unchecked</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="cb-checked" defaultChecked />
                <Label htmlFor="cb-checked">Checked</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="cb-disabled" disabled />
                <Label htmlFor="cb-disabled">Disabled</Label>
            </div>
        </div>
    )
};
