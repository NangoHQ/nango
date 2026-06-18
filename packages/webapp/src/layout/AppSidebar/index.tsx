import { BarChart3, Blocks, Cog, List, Plug, Sprout, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { EnvironmentDropdown } from './EnvironmentDropdown';
import { ProfileDropdown } from './ProfileDropdown';
import UsageCard from './UsageCard';
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
} from '@/components/ui/Sidebar';
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
    const { data: metaData, refetch: refetchMeta } = useMeta();
    const meta = metaData?.data;
    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const { data: environmentData } = useEnvironment(env);
    const plan = environmentData?.plan;

    const items = useMemo<SidebarItem[]>(() => {
        const gettingStarted = {
            title: 'Getting started',
            url: `/${env}/getting-started`,
            icon: Sprout,
            onClose: async () => {
                await apiPatchUser({
                    gettingStartedClosed: true
                });
                void refetchMeta();
            }
        };

        return [
            meta && showGettingStarted && !meta.gettingStartedClosed ? gettingStarted : null,
            { title: 'Integrations', url: `/${env}/integrations`, icon: Blocks },
            { title: 'Connections', url: `/${env}/connections`, icon: Plug },
            { title: 'Logs', url: `/${env}/logs`, icon: List },
            { title: 'Metrics', url: `/${env}`, icon: BarChart3 },
            { title: 'Environment settings', url: `/${env}/environment-settings`, icon: Cog }
        ].filter((item) => item !== null);
    }, [env, meta, refetchMeta, showGettingStarted]);

    // Only free accounts see the usage/capping card. Paid accounts have no enforced caps, so the card
    // just adds noise and surfaces upgrade/downgrade inconsistencies (NAN-5959).
    const showUsageCard = plan?.name === 'free';

    return (
        <Sidebar collapsible="none" className="border-r-[0.5px] border-border-default">
            <SidebarHeader className="p-0">
                <EnvironmentDropdown />
            </SidebarHeader>
            <SidebarContent className="pt-4">
                <SidebarGroup className="p-0 px-2.5">
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-0">
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        data-active={item.url === window.location.pathname}
                                        className="type-text-regular-sm gap-2.5 text-text-secondary [&>svg]:size-4!"
                                    >
                                        <Link to={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                    {item.onClose && (
                                        <SidebarMenuAction
                                            onClick={item.onClose}
                                            aria-label={`Close ${item.title}`}
                                            className="text-icon-secondary hover:bg-transparent hover:text-icon-default"
                                        >
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
                {showUsageCard && (
                    <div className="px-3 mb-8">
                        <UsageCard />
                    </div>
                )}
                <ProfileDropdown />
            </SidebarFooter>
        </Sidebar>
    );
};
