import { ScopesInput } from '@/components-v2/patterns/ScopesInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Patterns/ScopesInput',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {
    name: 'Read-only',
    render: () => (
        <div className="w-96">
            <ScopesInput scopesString="repo,read:user,read:org" readOnly />
        </div>
    )
};

export const Editable: Story = {
    render: () => (
        <div className="w-96">
            <ScopesInput
                scopesString="repo,read:user"
                availableScopes={['repo', 'read:user', 'read:org', 'write:packages', 'delete:packages']}
                showAvailableScopesDropdown
                onChange={async () => {}}
            />
        </div>
    )
};
