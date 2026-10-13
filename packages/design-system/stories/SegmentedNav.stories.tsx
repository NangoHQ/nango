import { Bot, Code } from 'lucide-react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { SegmentedNav } from '@/components/ui/SegmentedNav';
import { Button } from '../src/components/ui/button';

import type { SegmentedNavOption } from '@/components/ui/SegmentedNav';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'App Components/UI/SegmentedNav',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <MemoryRouter initialEntries={['/agent']}>
                <Story />
            </MemoryRouter>
        )
    ]
};
export default meta;
type Story = StoryObj<typeof meta>;

type Mode = 'agent' | 'functions';

const withIcons: SegmentedNavOption<Mode>[] = [
    { value: 'agent', label: 'Agent', to: '/agent', Icon: Bot },
    { value: 'functions', label: 'Functions', to: '/functions', Icon: Code }
];

const Routed: React.FC<{ options: SegmentedNavOption<Mode>[] }> = ({ options }) => {
    const { pathname } = useLocation();
    const value = options.find((option) => option.to === pathname)?.value ?? 'agent';
    return <SegmentedNav aria-label="Playground mode" value={value} options={options} />;
};

export const Default: Story = {
    render: () => <Routed options={withIcons} />
};

export const LabelsOnly: Story = {
    render: () => (
        <Routed
            options={[
                { value: 'agent', label: 'Agent', to: '/agent' },
                { value: 'functions', label: 'Functions', to: '/functions' }
            ]}
        />
    )
};

export const BesideAnOutlineButton: Story = {
    render: () => (
        <div className="flex w-[480px] items-center justify-between">
            <Routed options={withIcons} />
            <Button variant="outline" size="md">
                New chat
            </Button>
        </div>
    )
};
