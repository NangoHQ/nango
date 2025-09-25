import { Blocks, ChartBar, Logs, Plug, Settings2, Sparkle, X } from 'lucide-react';
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
} from './ui/sidebar';
import UsageCard from '@/components-v2/UsageCard';
import { useEnvironment } from '@/hooks/useEnvironment';
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
    const { plan } = useEnvironment(env);
    const { meta, mutate: mutateMeta } = useMeta();
    const showGettingStarted = useStore((state) => state.showGettingStarted);

    const items = useMemo<SidebarItem[]>(() => {
        const gettingStarted = {
            title: 'Getting Started',
            url: `/${env}/getting-started`,
            icon: Sparkle,
            onClose: async () => {
                await apiPatchUser({
                    gettingStartedClosed: true
                });
                void mutateMeta();
            }
        };

        return [
            meta && showGettingStarted && !meta.gettingStartedClosed ? gettingStarted : null,
            { title: 'Integrations', url: `/${env}/integrations`, icon: Blocks },
            { title: 'Connections', url: `/${env}/connections`, icon: Plug },
            { title: 'Logs', url: `/${env}/logs`, icon: Logs },
            { title: 'Metrics', url: `/${env}`, icon: ChartBar },
            { title: 'Environment Settings', url: `/${env}/environment-settings`, icon: Settings2 }
        ].filter((item) => item !== null);
    }, [env, meta, mutateMeta, showGettingStarted]);

    return (
        <Sidebar collapsible="none">
            <SidebarHeader className="p-3 py-2.5">
                <EnvironmentDropdown />
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild data-active={item.url === window.location.pathname}>
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
                {plan?.name === 'free' && (
                    <div className="p-3 mb-25">
                        <UsageCard />
                    </div>
                )}
                <ProfileDropdown />
            </SidebarFooter>
        </Sidebar>
    );
};
