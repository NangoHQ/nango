import { Checkbox } from '@/components/ui/Checkbox';
import { FieldLabel } from '../src/components/ui/field';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/UI/Checkbox',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
                <Checkbox id="cb-unchecked" />
                <FieldLabel htmlFor="cb-unchecked">Unchecked</FieldLabel>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="cb-checked" defaultChecked />
                <FieldLabel htmlFor="cb-checked">Checked</FieldLabel>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="cb-disabled" disabled />
                <FieldLabel htmlFor="cb-disabled">Disabled</FieldLabel>
            </div>
        </div>
    )
};
