import { MemoryRouter } from 'react-router-dom';

import { CriticalErrorAlert } from '@/components-v2/patterns/CriticalErrorAlert';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Patterns/CriticalErrorAlert',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <MemoryRouter>
                <Story />
            </MemoryRouter>
        )
    ]
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-4 max-w-xl">
            <CriticalErrorAlert message="Failed to connect to the upstream API" />
            <CriticalErrorAlert message="Invalid credentials — refresh your access token." />
        </div>
    )
};
