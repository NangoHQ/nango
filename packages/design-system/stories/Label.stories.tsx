import { Label } from '@/components-v2/ui/Label';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Label',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-3">
            <Label>API Key</Label>
            <Label>
                Connection ID <span className="text-feedback-error-fg">*</span>
            </Label>
        </div>
    )
};
