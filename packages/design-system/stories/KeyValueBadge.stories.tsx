import { KeyValueBadge } from '@/components-v2/ui/KeyValueBadge';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/UI/KeyValueBadge',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Darker</span>
                <KeyValueBadge label="Status" variant="darker">
                    Active
                </KeyValueBadge>
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Lighter</span>
                <KeyValueBadge label="Env" variant="lighter">
                    Production
                </KeyValueBadge>
            </div>
        </div>
    )
};
