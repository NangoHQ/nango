import { AreaChart, Blocks, Logs, Plug, Settings2, Sprout, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { EnvironmentDropdown } from './EnvironmentDropdown';
import { ProfileDropdown } from './ProfileDropdown';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem
} from '../ui/sidebar';
import { useMeta } from '@/hooks/useMeta';
import { apiPatchUser } from '@/hooks/useUser';
import { useStore } from '@/store';

import type { LucideIcon } from 'lucide-react';

interface SidebarItem {
    title: string;
    url: string;
    icon: LucideIcon;
    onClose?: () => Promise<void>;
}

export const AppSidebar: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: metaData, refetch: refetchMeta } = useMeta();
    const meta = metaData?.data;
    const showGettingStarted = useStore((state) => state.showGettingStarted);

    const items = useMemo<SidebarItem[]>(() => {
        const gettingStarted = {
            title: 'Getting started',
            url: `/${env}/getting-started`,
            icon: Sprout,
            onClose: async () => {
                await apiPatchUser({ gettingStartedClosed: true });
                void refetchMeta();
            }
        };

        return [
            meta && showGettingStarted && !meta.gettingStartedClosed ? gettingStarted : null,
            { title: 'Integrations', url: `/${env}/integrations`, icon: Blocks },
            { title: 'Connections', url: `/${env}/connections`, icon: Plug },
            { title: 'Logs', url: `/${env}/logs`, icon: Logs },
            { title: 'Metrics', url: `/${env}`, icon: AreaChart },
            { title: 'Environment settings', url: `/${env}/environment-settings`, icon: Settings2 }
        ].filter((item) => item !== null);
    }, [env, meta, refetchMeta, showGettingStarted]);

    return (
        <Sidebar collapsible="none" className="border-r border-[color:var(--border-default)]">
            <SidebarHeader className="p-0">
                <EnvironmentDropdown />
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup className="p-3 pt-4">
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-0">
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        data-active={item.url === window.location.pathname}
                                        className="h-8 gap-2.5 rounded-none px-2 text-[13px] [&>svg]:size-4"
                                    >
                                        <Link to={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                    {item.onClose && (
                                        <SidebarMenuAction onClick={item.onClose}>
                                            <X />
                                        </SidebarMenuAction>
                                    )}
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-0">
                <ProfileDropdown />
            </SidebarFooter>
        </Sidebar>
    );
};
