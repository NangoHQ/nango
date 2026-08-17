import { ArrowUpRight, BarChart3, Blocks, Cog, List, Plug, Sprout, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { OverdueInvoiceAlert } from '@/components/patterns/OverdueInvoiceAlert';
import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
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
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetOverdueInvoices, useCurrentPlan } from '@/hooks/usePlan';
import { apiPatchUser } from '@/hooks/useUser';
import { useStore } from '@/store';
import { EnvironmentDropdown } from './EnvironmentDropdown';
import { ProfileDropdown } from './ProfileDropdown';
import UsageLimitAlert from './UsageLimitAlert';

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
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const { can } = usePermissions();

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

    // Only free accounts see the usage-limit alert. Paid accounts have no enforced caps, so it
    // just adds noise and surfaces upgrade/downgrade inconsistencies (NAN-5959).
    const showUsageAlert = plan?.name === 'free';

    // Overdue-invoice warning: shown on overdue state for paying plans (the hook
    // skips the request for free/non-paying plans). It's a payment concern, so it
    // is not gated on the usage card above.
    //
    // Only for users who can act on it. On plans without RBAC every role resolves this to true,
    // so in practice this narrows the audience to administrators only on Growth and Enterprise.
    const { data: overdue } = useApiGetOverdueInvoices(env, plan);
    const canManageBilling = can(permissions.canManageBilling);
    const showOverdueCard = Boolean(overdue?.data.hasOverdue) && canManageBilling;

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
                                            <span data-ph-unmask>{item.title}</span>
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
                {showOverdueCard && (
                    <div className="px-2.5 mb-4">
                        <OverdueInvoiceAlert>
                            {/* One action only: two don't fit across a 200px sidebar, and AlertButton is
                                nowrap, so they overflow the card rather than stacking. The invoices link
                                lives on the Billing page banner, which has room for both.

                                Links to that page rather than opening the Stripe dialog, which would mean
                                making the dialog mountable from anywhere in the app. */}
                            <AlertButtonLink to="/team/billing#payment-and-invoices">
                                Edit payment method <ArrowUpRight />
                            </AlertButtonLink>
                        </OverdueInvoiceAlert>
                    </div>
                )}
                {showUsageAlert && (
                    <div className="px-2.5 mb-6">
                        <UsageLimitAlert />
                    </div>
                )}
                <ProfileDropdown />
            </SidebarFooter>
        </Sidebar>
    );
};
