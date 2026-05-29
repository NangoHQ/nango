import { fn } from 'storybook/test';

import { KeyValueInput } from '@/components-v2/patterns/KeyValueInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Patterns/KeyValueInput',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-8 w-96">
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Empty</span>
                <KeyValueInput onChange={fn()} />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">With values</span>
                <KeyValueInput
                    initialValues={{ Authorization: 'Bearer token123', 'X-Tenant-Id': 'acme' }}
                    onChange={fn()}
                />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Secret</span>
                <KeyValueInput
                    initialValues={{ API_KEY: 'secret-key-abc' }}
                    onChange={fn()}
                    isSecret
                />
            </div>
        </div>
    )
};
