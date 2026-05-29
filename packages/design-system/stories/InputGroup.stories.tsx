import { Search } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/InputGroup';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof InputGroup> = {
    component: InputGroup,
    title: 'Components v2/InputGroup',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const WithLeadingIcon: Story = {
    render: () => (
        <InputGroup className="w-64">
            <InputGroupAddon>
                <Search className="size-4 text-text-tertiary" />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search integrations…" />
        </InputGroup>
    )
};

export const WithTrailingText: Story = {
    render: () => (
        <InputGroup className="w-48">
            <InputGroupInput placeholder="0" type="number" />
            <InputGroupAddon align="inline-end">
                <span className="text-text-tertiary text-body-small-regular">minutes</span>
            </InputGroupAddon>
        </InputGroup>
    )
};
