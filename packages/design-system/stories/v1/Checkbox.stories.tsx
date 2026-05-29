import { Checkbox } from '@/components/ui/Checkbox';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/UI/Checkbox',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-6">
            <div className="flex items-center gap-2">
                <Checkbox id="v1-unchecked" />
                <label htmlFor="v1-unchecked" className="text-white text-sm">
                    Unchecked
                </label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="v1-checked" defaultChecked />
                <label htmlFor="v1-checked" className="text-white text-sm">
                    Checked
                </label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="v1-disabled" disabled />
                <label htmlFor="v1-disabled" className="text-white text-sm opacity-50">
                    Disabled
                </label>
            </div>
        </div>
    )
};
