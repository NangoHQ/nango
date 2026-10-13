import { Bot, Code } from 'lucide-react';
import { useState } from 'react';

import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Button } from '../src/components/ui/button';

import type { SegmentedTabOption } from '@/components/ui/SegmentedTabs';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'App Components/UI/SegmentedTabs',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

type Mode = 'agent' | 'functions';

const withIcons: SegmentedTabOption<Mode>[] = [
    { value: 'agent', label: 'Agent', Icon: Bot },
    { value: 'functions', label: 'Functions', Icon: Code }
];

const Controlled: React.FC<{ options: SegmentedTabOption<Mode>[] }> = ({ options }) => {
    const [value, setValue] = useState<Mode>('agent');
    return <SegmentedTabs aria-label="Playground mode" value={value} onValueChange={setValue} options={options} />;
};

export const Default: Story = {
    render: () => <Controlled options={withIcons} />
};

export const LabelsOnly: Story = {
    render: () => (
        <Controlled
            options={[
                { value: 'agent', label: 'Agent' },
                { value: 'functions', label: 'Functions' }
            ]}
        />
    )
};

export const BesideAnOutlineButton: Story = {
    render: () => (
        <div className="flex items-center gap-2">
            <Controlled options={withIcons} />
            <Button variant="outline" size="md">
                New chat
            </Button>
        </div>
    )
};
