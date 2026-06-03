import { ScopesInput } from '@/components-v2/patterns/ScopesInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ScopesInput> = {
    component: ScopesInput,
    title: 'Components v2/Patterns/ScopesInput',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="w-96">
            <ScopesInput scopesString="read:users,write:messages" onChange={async () => {}} />
        </div>
    )
};

export const Empty: Story = {
    render: () => (
        <div className="w-96">
            <ScopesInput onChange={async () => {}} />
        </div>
    )
};

export const ReadOnly: Story = {
    render: () => (
        <div className="w-96">
            <ScopesInput scopesString="read:users,write:messages" readOnly />
        </div>
    )
};
