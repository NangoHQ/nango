import { Blocks, ChartBar, Logs, Plug, Settings2, User } from 'lucide-react';
import { useMemo } from 'react';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from './ui/sidebar';
import { useStore } from '@/store';
import { cn } from '@/utils/utils';

export const AppSidebar: React.FC = () => {
    const env = useStore((state) => state.env);

    const items = useMemo(() => {
        return [
            { title: 'Integrations', url: `/${env}/integrations`, icon: Blocks },
            { title: 'Connections', url: `/${env}/connections`, icon: Plug },
            { title: 'Logs', url: `/${env}/logs`, icon: Logs },
            { title: 'Metrics', url: `/${env}`, icon: ChartBar },
            { title: 'Environment Settings', url: `/${env}/environment-settings`, icon: Settings2 }
        ];
    }, [env]);

    return (
        <Sidebar collapsible="none">
            <SidebarHeader />
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        className={cn(
                                            item.url === window.location.pathname && 'bg-background-press text-text-primary hover:bg-background-press'
                                        )}
                                    >
                                        <a href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenuButton asChild>
                    <a href={`/${env}/user-settings`}>
                        <User />
                        <span>User Settings</span>
                    </a>
                </SidebarMenuButton>
            </SidebarFooter>
        </Sidebar>
    );
};
