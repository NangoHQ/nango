import { ArrowUpRight, BarChart3, Blocks, BookOpen, Cog, List, MessageSquareCode, MessagesSquare, Plug, Sprout, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator
} from '@/components/ui/Sidebar';
import { OverdueInvoiceAlert } from '@/features/Billing/OverdueInvoiceAlert';
import { useDismissAgentGettingStarted } from '@/hooks/useAgentGettingStarted';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetOverdueInvoices, useCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { openSupportChat } from '@/utils/support';
import { EnvironmentDropdown } from './EnvironmentDropdown';
import { ProfileDropdown } from './ProfileDropdown';
import UsageLimitAlert from './UsageLimitAlert';

import type { LucideIcon } from 'lucide-react';

interface SidebarItem {
    title: string;
    url: string;
    icon: LucideIcon;
    exact?: boolean;
}

export const AppSidebar: React.FC = () => {
    const env = useStore((state) => state.env);
    const { pathname } = useLocation();
    const { data: metaData } = useMeta();
    const { mutateAsync: dismissGettingStarted } = useDismissAgentGettingStarted();
    const { toast } = useToast();
    const meta = metaData?.data;
    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const { can } = usePermissions();
    const showPlayground = Boolean(meta?.agentPlayground) && can('environment:agent_sessions:write');

    const items = useMemo<SidebarItem[]>(() => {
        return [
            showPlayground ? { title: 'Playground', url: `/${env}/playground`, icon: MessageSquareCode } : null,
            { title: 'Integrations', url: `/${env}/integrations`, icon: Blocks },
            { title: 'Connections', url: `/${env}/connections`, icon: Plug },
            { title: 'Logs', url: `/${env}/logs`, icon: List },
            { title: 'Metrics', url: `/${env}`, icon: BarChart3, exact: true },
            { title: 'Environment settings', url: `/${env}/environment-settings`, icon: Cog }
        ].filter((item) => item !== null);
    }, [env, showPlayground]);

    const gettingStartedUrl = `/${env}/getting-started`;
    const showGettingStartedItem = Boolean(meta && showGettingStarted && !meta.gettingStartedDismissed);

    const closeGettingStarted = async () => {
        try {
            await dismissGettingStarted();
        } catch {
            toast({ title: 'Could not hide Getting started', variant: 'error' });
            return;
        }
        track('onboarding:dismiss_button_click');
    };

    const isActive = (url: string, exact = false) => pathname === url || (!exact && pathname.startsWith(`${url}/`));

    // Only free accounts see the usage-limit alert. Paid accounts have no enforced caps, so it
    // just adds noise and surfaces upgrade/downgrade inconsistencies (NAN-5959).
    const showUsageAlert = plan?.name === 'free';

    const canManageBilling = can('account:billing:payment_methods:create');
    const { data: overdue } = useApiGetOverdueInvoices(env, plan);
    const showOverdueAlert = Boolean(overdue?.data.hasOverdue);

    return (
        <Sidebar collapsible="none" className="border-r-[0.5px] border-border-default">
            <SidebarHeader>
                <EnvironmentDropdown />
            </SidebarHeader>
            <SidebarContent>
                <SidebarMenu>
                    {items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)}>
                                <Link to={item.url}>
                                    <item.icon />
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarContent>
            <SidebarFooter>
                {showOverdueAlert && (
                    <div className="mb-4">
                        <OverdueInvoiceAlert canManageBilling={canManageBilling}>
                            <AlertButtonLink to="/team/billing" onClick={() => track('billing:overdue_alert_link_click', {})}>
                                View billing <ArrowUpRight />
                            </AlertButtonLink>
                        </OverdueInvoiceAlert>
                    </div>
                )}
                {showUsageAlert && (
                    <div className="mb-4">
                        <UsageLimitAlert />
                    </div>
                )}
                <SidebarMenu>
                    {showGettingStartedItem && (
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive(gettingStartedUrl)}>
                                <Link to={gettingStartedUrl}>
                                    <Sprout />
                                    <span>Getting started</span>
                                </Link>
                            </SidebarMenuButton>
                            <SidebarMenuAction aria-label="Dismiss Getting started" onClick={() => void closeGettingStarted()}>
                                <X />
                            </SidebarMenuAction>
                        </SidebarMenuItem>
                    )}
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <a href="https://nango.dev/docs" target="_blank" rel="noreferrer">
                                <BookOpen />
                                <span>Docs</span>
                                <ArrowUpRight className="size-3.5" />
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={openSupportChat}>
                            <MessagesSquare />
                            <span>Support</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                <SidebarSeparator className="mb-2" />
                <ProfileDropdown />
            </SidebarFooter>
        </Sidebar>
    );
};
