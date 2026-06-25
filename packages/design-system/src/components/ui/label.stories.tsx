import { Label } from './label';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/Label',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Label is the base primitive; in field compositions prefer FieldLabel (see the Field stories).
export const States: Story = {
    render: () => (
        <div className="flex flex-col gap-4 w-72">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Default</span>
                <Label htmlFor="api-key">API key</Label>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Required</span>
                <Label htmlFor="connection-id">
                    Connection ID <span className="text-text-danger">*</span>
                </Label>
            </div>
        </div>
    )
};
