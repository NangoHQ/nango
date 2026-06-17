import { ChevronRight } from 'lucide-react';

import { Button } from '../src/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Collapsible> = {
    component: Collapsible,
    title: 'Components/UI/Collapsible',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Collapsible className="w-64 border border-border-base rounded p-4">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex w-full items-center justify-between [&[data-state=open]_svg]:rotate-90">
                    Advanced settings
                    <ChevronRight className="size-4 transition-transform duration-200" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 flex flex-col gap-2 text-sm text-text-secondary">
                <p>Hidden content that expands when triggered.</p>
                <p>Additional configuration options go here.</p>
            </CollapsibleContent>
        </Collapsible>
    )
};
