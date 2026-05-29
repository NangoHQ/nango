import { useState } from 'react';

import { ComboboxSelect } from '@/components-v2/ui/Combobox';

import type { Meta, StoryObj } from '@storybook/react-vite';

const options = [
    { value: 'github', label: 'GitHub' },
    { value: 'slack', label: 'Slack' },
    { value: 'hubspot', label: 'HubSpot' },
    { value: 'salesforce', label: 'Salesforce' },
    { value: 'notion', label: 'Notion' }
];

const meta: Meta = {
    title: 'Components v2/UI/Combobox',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [value, setValue] = useState<string>('');
        return (
            <div className="flex gap-8 items-start">
                <div className="flex flex-col gap-1">
                    <span className="story-section-heading">Single (empty)</span>
                    <div className="w-52">
                        <ComboboxSelect options={options} value={value} onValueChange={setValue} placeholder="Select integration…" />
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="story-section-heading">Single (selected)</span>
                    <div className="w-52">
                        <ComboboxSelect options={options} value="github" onValueChange={() => {}} placeholder="Select integration…" />
                    </div>
                </div>
            </div>
        );
    }
};

export const MultiSelect: Story = {
    name: 'Multi-select',
    render: () => {
        const [selected, setSelected] = useState<string[]>(['github', 'slack']);
        return (
            <ComboboxSelect
                allowMultiple
                options={options}
                selected={selected}
                onSelectedChange={setSelected}
                label="Integrations"
                onClearAll={() => setSelected([])}
            />
        );
    }
};
