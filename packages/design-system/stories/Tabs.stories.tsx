import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/ui/Tabs';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Tabs',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Tabs defaultValue="overview" className="w-96">
            <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="syncs">Syncs</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="disabled" disabled>
                    Disabled
                </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
                <p className="text-text-secondary text-body-medium-regular pt-4">Integration overview content.</p>
            </TabsContent>
            <TabsContent value="syncs">
                <p className="text-text-secondary text-body-medium-regular pt-4">Sync configuration content.</p>
            </TabsContent>
            <TabsContent value="logs">
                <p className="text-text-secondary text-body-medium-regular pt-4">Log entries appear here.</p>
            </TabsContent>
        </Tabs>
    )
};
