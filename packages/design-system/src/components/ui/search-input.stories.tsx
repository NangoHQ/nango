import { useState } from 'react';

import { SearchInput } from './search-input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof SearchInput> = {
    title: 'Design System/Components/SearchInput',
    component: SearchInput,
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Press "/" anywhere on the canvas to focus it, type to swap the "/" hint for a Clear button, Esc to clear.
export const Default: Story = {
    render: () => {
        const [value, setValue] = useState('');
        return (
            <div className="flex w-96 flex-col gap-2">
                <SearchInput placeholder="Filter scopes" value={value} onValueChange={setValue} />
                <span className="text-text-secondary type-text-regular-xs">Value: “{value}”</span>
            </div>
        );
    }
};

export const Variants: Story = {
    render: () => (
        <div className="flex w-96 flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Empty · md</span>
                <SearchInput placeholder="Filter scopes" />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">With value · md</span>
                <SearchInput placeholder="Filter scopes" defaultValue="read:users" shortcut={false} />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">sm</span>
                <SearchInput size="sm" placeholder="Search integrations" shortcut={false} />
            </div>
            <div className="flex flex-col gap-1">
                <span className="story-section-heading">Disabled</span>
                <SearchInput disabled placeholder="Filter scopes" shortcut={false} />
            </div>
        </div>
    )
};
