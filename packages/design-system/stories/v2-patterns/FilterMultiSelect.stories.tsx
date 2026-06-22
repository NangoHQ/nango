import { useState } from 'react';

import { FilterMultiSelect } from '@/components/patterns/FilterMultiSelect';

import type { Meta, StoryObj } from '@storybook/react-vite';

const FRUIT_OPTIONS = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry' },
    { value: 'date', label: 'Date' },
    { value: 'elderberry', label: 'Elderberry' }
];

const GROUP_OPTIONS = [
    {
        value: 'citrus',
        label: 'Citrus',
        children: [
            { value: 'lemon', label: 'Lemon' },
            { value: 'lime', label: 'Lime' },
            { value: 'orange', label: 'Orange' }
        ]
    },
    {
        value: 'berries',
        label: 'Berries',
        children: [
            { value: 'strawberry', label: 'Strawberry' },
            { value: 'blueberry', label: 'Blueberry' }
        ]
    }
];

const meta: Meta = {
    title: 'Components/Patterns/FilterMultiSelect',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const [selected, setSelected] = useState<string[]>([]);
        return <FilterMultiSelect label="Fruit" options={FRUIT_OPTIONS} selected={selected} onChange={setSelected} />;
    }
};

export const WithSelection: Story = {
    render: () => {
        const [selected, setSelected] = useState(['apple', 'cherry']);
        return <FilterMultiSelect label="Fruit" options={FRUIT_OPTIONS} selected={selected} defaultSelect={[]} onChange={setSelected} />;
    }
};

export const WithSearch: Story = {
    render: () => {
        const [selected, setSelected] = useState<string[]>([]);
        return <FilterMultiSelect label="Fruit" options={FRUIT_OPTIONS} selected={selected} onChange={setSelected} showSearch />;
    }
};

export const WithGroupedOptions: Story = {
    render: () => {
        const [selected, setSelected] = useState<string[]>([]);
        return <FilterMultiSelect label="Category" options={GROUP_OPTIONS} selected={selected} onChange={setSelected} />;
    }
};

export const MaxSelections: Story = {
    render: () => {
        const [selected, setSelected] = useState(['apple', 'banana']);
        return <FilterMultiSelect label="Fruit (max 2)" options={FRUIT_OPTIONS} selected={selected} defaultSelect={[]} onChange={setSelected} max={2} />;
    }
};
