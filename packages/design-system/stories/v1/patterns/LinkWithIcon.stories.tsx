import { MemoryRouter } from 'react-router-dom';

import LinkWithIcon from '@/components/patterns/LinkWithIcon';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v1/Patterns/LinkWithIcon',
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
        <div className="bg-bg-black p-6 rounded-md flex flex-col gap-4">
            <LinkWithIcon to="/integrations" type="internal">
                View integrations
            </LinkWithIcon>
            <LinkWithIcon to="https://docs.nango.dev" type="external">
                Read the docs
            </LinkWithIcon>
        </div>
    )
};
