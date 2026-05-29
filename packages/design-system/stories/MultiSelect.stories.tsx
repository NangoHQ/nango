import { useState } from 'react';

import { MultiSelect } from '@/components-v2/ui/MultiSelect';

import type { Meta, StoryObj } from '@storybook/react-vite';

const options = [
    { value: 'contacts', label: 'Contacts' },
    { value: 'deals', label: 'Deals' },
    { value: 'companies', label: 'Companies' },
    { value: 'activities', label: 'Activities' },
    { value: 'tasks', label: 'Tasks' }
];

const meta: Meta = {
    title: 'Components v2/MultiSelect',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [selected, setSelected] = useState<string[]>(['contacts']);
        return <MultiSelect label="Sync models" options={options} selected={selected} onValueChange={setSelected} />;
    }
};
