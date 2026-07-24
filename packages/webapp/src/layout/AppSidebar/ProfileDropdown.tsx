import { ChevronsUpDown, CreditCard, LogOut, ScrollText, SlidersHorizontal, Sparkle, UserRoundCog, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/Sidebar';
import { useDevPanelStore, useIsDevToolsEnabled } from '@/features/DevToolPanel';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useUser } from '@/hooks/useUser';
import { useStore } from '@/store';
import { toAcronym } from '@/utils/avatar';
import { globalEnv } from '@/utils/env';
import { useSignout } from '@/utils/user';
import { NavigationItem, navigationItemVariants } from './NavigationItem';

export const ProfileDropdown: React.FC = () => {
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const navigate = useNavigate();
    const signout = useSignout();
    const { user } = useUser();
    const { can } = usePermissions();
    const canReadAuditTrail = can(permissions.canReadAuditTrail);
    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const env = useStore((state) => state.env);
    const toggleDevPanel = useDevPanelStore((s) => s.toggle);
    const isDevToolsEnabled = useIsDevToolsEnabled();

    const items = useMemo(() => {
        const list = [
            {
                label: 'Team',
                icon: Users,
                href: `/team-settings`
            },
            {
                label: 'Profile',
                icon: UserRoundCog,
                href: `/user-settings`
            }
        ];

        if (meta && meta.gettingStartedClosed && showGettingStarted) {
            list.push({
                label: 'Getting Started',
                icon: Sparkle,
                href: `/dev/getting-started`
            });
        }

        if (globalEnv.features.plan) {
            list.push({
                label: 'Billing & usage',
                icon: CreditCard,
                href: `/team/billing`
            });
        }

        if (meta?.auditTrail && canReadAuditTrail) {
            list.push({
                label: 'Audit log',
                icon: ScrollText,
                href: `/${env}/audit`
            });
        }

        return list;
    }, [meta, showGettingStarted, env, canReadAuditTrail]);

    const initials = user?.name ? toAcronym(user.name) : '';

    if (!meta || !user) {
        return;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger className="group/profile focus-inset flex h-14 w-full cursor-pointer items-center justify-between border-t-[0.5px] border-b-[0.5px] border-border-default px-4 outline-none transition-colors hover:bg-state-hover data-[state=open]:bg-surface-overlay">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="type-text-regular-xs flex size-8 shrink-0 items-center justify-center rounded-full border-[0.5px] border-border-default bg-surface-overlay text-text-default">
                                {initials}
                            </div>
                            <div className="flex min-w-0 flex-col items-start">
                                <span className="type-text-medium-sm max-w-28 truncate text-text-default">{user?.name}</span>
                                <span className="type-text-regular-xs max-w-28 truncate text-text-muted">{user?.email}</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="size-4 shrink-0 text-icon-secondary group-hover/profile:text-icon-default" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        alignOffset={0}
                        side="right"
                        sideOffset={0}
                        className="w-50 rounded-none border-[0.5px] border-border-default p-1"
                    >
                        {items.map((item, index) => (
                            <DropdownMenuItem key={index} onSelect={() => navigate(item.href)} className={navigationItemVariants()}>
                                <NavigationItem icon={<item.icon />}>{item.label}</NavigationItem>
                            </DropdownMenuItem>
                        ))}
                        {isDevToolsEnabled && (
                            <DropdownMenuItem onSelect={toggleDevPanel} className={navigationItemVariants()}>
                                <NavigationItem icon={<SlidersHorizontal />}>Dev Tools</NavigationItem>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => signout()} className={navigationItemVariants()}>
                            <NavigationItem icon={<LogOut />}>Log out</NavigationItem>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
