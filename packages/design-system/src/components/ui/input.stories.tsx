import { AtSign, Search } from 'lucide-react';

import { Input, PasswordInput } from './input';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Input',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
    name: 'States',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-8)', maxWidth: '18rem' }}>
            <Input placeholder="Default" />
            <Input defaultValue="Filled value" />
            <Input placeholder="Hover (move cursor here)" />
            <Input placeholder="Invalid" invalid />
            <Input placeholder="Disabled" disabled />
        </div>
    )
};

export const WithIcons: Story = {
    name: 'With icons',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-8)', maxWidth: '18rem' }}>
            <Input placeholder="Search…" leadingIcon={<Search size={14} />} />
            <Input placeholder="Email" leadingIcon={<AtSign size={14} />} />
            <Input placeholder="Leading + trailing" leadingIcon={<Search size={14} />} trailingIcon={<AtSign size={14} />} />
            <Input placeholder="Invalid with icon" invalid leadingIcon={<Search size={14} />} />
        </div>
    )
};

export const Password: Story = {
    name: 'Password',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-8)', maxWidth: '18rem' }}>
            <PasswordInput placeholder="Enter password" />
            <PasswordInput defaultValue="secret123" />
            <PasswordInput placeholder="Disabled" disabled />
            <PasswordInput placeholder="Invalid" invalid />
        </div>
    )
};
