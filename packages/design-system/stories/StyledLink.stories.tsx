import { MemoryRouter } from 'react-router-dom';

import { StyledLink } from '@/components-v2/ui/StyledLink';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof StyledLink> = {
    component: StyledLink,
    title: 'Components v2/StyledLink',
    parameters: { layout: 'centered' },
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

export const Internal: Story = {
    args: { to: '/integrations', children: 'View integrations' }
};

export const External: Story = {
    args: { to: 'https://docs.nango.dev', children: 'Read the docs', type: 'external', icon: true }
};
