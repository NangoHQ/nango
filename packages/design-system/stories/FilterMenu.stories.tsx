import { useState } from 'react';

import { FilterMenu } from '@/components/ui/FilterMenu';
import { FilterTrigger } from '@/components/ui/FilterTrigger';

import type { FilterCheckState, FilterMenuOption } from '@/components/ui/FilterMenu';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'App Components/UI/FilterMenu',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const STATUSES: FilterMenuOption[] = ['Success', 'Failed', 'Running', 'Cancelled', 'Timeout', 'Waiting'].map((label) => ({
    value: label.toLowerCase(),
    label
}));

const CONNECTIONS: FilterMenuOption[] = [
    'a42cf515-6bd4-4c1f-9389-b4ccd1ab9ce4',
    'b9e58975-4dc5-4243-8feb-07ce377532da',
    'c14fad81-ccd2-4479-be64-3174e3fc3a15',
    '78f14123-3d01-49a5-8e5e-825dea272e53'
].map((value) => ({ value, label: value, mono: true }));

const TYPES: FilterMenuOption[] = [
    {
        value: 'sync',
        label: 'Sync',
        children: ['run', 'init', 'pause', 'cancel'].map((label) => ({ value: `sync:${label}`, label }))
    },
    { value: 'tool', label: 'Tool' },
    {
        value: 'webhook',
        label: 'Webhook',
        children: ['incoming', 'forward'].map((label) => ({ value: `webhook:${label}`, label }))
    },
    { value: 'proxy', label: 'Proxy' }
];

function FlatFilter({ label, options, initial, searchable = false }: { label: string; options: FilterMenuOption[]; initial: string[]; searchable?: boolean }) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState(initial);
    return (
        <FilterMenu
            trigger={<FilterTrigger label={label} count={selected.length} selectedLabel={options.find((o) => o.value === selected[0])?.label} />}
            open={open}
            onOpenChange={setOpen}
            options={options}
            selected={selected}
            onToggle={(value) => setSelected((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]))}
            onClear={() => setSelected([])}
            searchable={searchable}
        />
    );
}

export const TriggerStates: Story = {
    render: () => (
        <div className="flex gap-2">
            <FlatFilter label="Status" options={STATUSES} initial={[]} />
            <FlatFilter label="Status" options={STATUSES} initial={['failed']} />
            <FlatFilter label="Status" options={STATUSES} initial={['failed', 'timeout']} />
        </div>
    )
};

export const Searchable: Story = {
    render: () => <FlatFilter label="Connection" options={CONNECTIONS} initial={[CONNECTIONS[0]?.value ?? '']} searchable />
};

function TreeFilter() {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>(['sync:run']);

    const checkState = (value: string): FilterCheckState => {
        if (selected.includes(value)) return 'checked';
        const group = TYPES.find((option) => option.value === value);
        if (group?.children?.some((child) => selected.includes(child.value))) return 'indeterminate';
        const parent = TYPES.find((option) => option.children?.some((child) => child.value === value));
        return parent && selected.includes(parent.value) ? 'checked' : 'unchecked';
    };

    return (
        <FilterMenu
            trigger={<FilterTrigger label="Type" count={selected.length} selectedLabel={selected[0]} />}
            open={open}
            onOpenChange={setOpen}
            options={TYPES}
            selected={selected}
            checkState={checkState}
            onToggle={(value) => setSelected((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]))}
            onClear={() => setSelected([])}
        />
    );
}

export const ExpandableGroups: Story = {
    render: () => <TreeFilter />
};
