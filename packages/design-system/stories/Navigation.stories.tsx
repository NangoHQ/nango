import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/ui/Navigation';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Navigation> = {
    component: Navigation,
    title: 'Components v2/UI/Navigation',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
    render: () => (
        <Navigation defaultValue="integrations" className="w-52">
            <NavigationList>
                <NavigationTrigger value="integrations">Integrations</NavigationTrigger>
                <NavigationTrigger value="connections">Connections</NavigationTrigger>
                <NavigationTrigger value="logs">Logs</NavigationTrigger>
                <NavigationTrigger value="settings">Settings</NavigationTrigger>
            </NavigationList>
            <NavigationContent value="integrations">
                <p className="text-text-secondary text-body-medium-regular p-2">Integrations panel</p>
            </NavigationContent>
            <NavigationContent value="connections">
                <p className="text-text-secondary text-body-medium-regular p-2">Connections panel</p>
            </NavigationContent>
        </Navigation>
    )
};
