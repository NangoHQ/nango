import { Input, PasswordInput } from './Input';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Input',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

function SearchIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
        </svg>
    );
}

function AtIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M10.5 8A2.5 2.5 0 1013 10.5V8a5 5 0 10-2.5 4.33" />
        </svg>
    );
}

export const States: Story = {
    name: 'States',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-3)', maxWidth: '18rem' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-3)', maxWidth: '18rem' }}>
            <Input placeholder="Search…" leadingIcon={<SearchIcon />} />
            <Input placeholder="Email" leadingIcon={<AtIcon />} />
            <Input placeholder="Leading + trailing" leadingIcon={<SearchIcon />} trailingIcon={<AtIcon />} />
            <Input placeholder="Invalid with icon" invalid leadingIcon={<SearchIcon />} />
        </div>
    )
};

export const Password: Story = {
    name: 'Password',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-3)', maxWidth: '18rem' }}>
            <PasswordInput placeholder="Enter password" />
            <PasswordInput defaultValue="secret123" />
            <PasswordInput placeholder="Disabled" disabled />
            <PasswordInput placeholder="Invalid" invalid />
        </div>
    )
};
