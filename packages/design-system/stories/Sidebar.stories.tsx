import { LayoutDashboard, Link, Settings, Zap } from 'lucide-react';

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider
} from '@/components-v2/ui/Sidebar';

import type { Meta, StoryObj } from '@storybook/react-vite';

const navItems = [
    { label: 'Overview', icon: LayoutDashboard, value: 'overview' },
    { label: 'Integrations', icon: Zap, value: 'integrations' },
    { label: 'Connections', icon: Link, value: 'connections' },
    { label: 'Settings', icon: Settings, value: 'settings' }
];

const meta: Meta = {
    title: 'Components v2/Sidebar',
    parameters: { layout: 'fullscreen' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <SidebarProvider defaultOpen={true} style={{ minHeight: '400px' }}>
            <Sidebar>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {navItems.map((item) => (
                                    <SidebarMenuItem key={item.value}>
                                        <SidebarMenuButton>
                                            <item.icon />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
            </Sidebar>
        </SidebarProvider>
    )
};
