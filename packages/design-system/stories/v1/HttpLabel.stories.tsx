import { HttpLabel } from '@/components/ui/HttpLabel';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/UI/HttpLabel',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const Default: Story = {
    render: () => (
        <div className="bg-bg-black p-6 rounded-md flex items-center gap-4">
            {METHODS.map((method) => (
                <HttpLabel key={method} method={method} path="/api/endpoint" />
            ))}
        </div>
    )
};
