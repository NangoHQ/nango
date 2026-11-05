import { ChevronsUpDown, Contrast, CreditCard, History, KeyRound, LogOut, SlidersHorizontal, Sprout, UserCog, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { useDevPanelStore, useIsDevToolsEnabled } from '@/features/DevToolPanel';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useUser } from '@/hooks/useUser';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { toAcronym } from '@/utils/avatar';
import { globalEnv } from '@/utils/env';
import { useSignout } from '@/utils/user';
import { cn } from '@/utils/utils';
import { navigationMenuContentClassName, navigationMenuItemClassName } from './navigationMenu';
import { ThemeToggle } from './ThemeToggle';

import type { LucideIcon } from 'lucide-react';

interface ProfileMenuItem {
    label: string;
    icon: LucideIcon;
    href: string;
    onSelect?: () => void;
}

export const ProfileDropdown: React.FC = () => {
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const signout = useSignout();
    const { user } = useUser();
    const { can } = usePermissions();
    const canReadAuditTrail = can('account:audit_trail:read');
    const canManageAccountKeys = can('account:api_keys:list');
    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const toggleDevPanel = useDevPanelStore((s) => s.toggle);
    const isDevToolsEnabled = useIsDevToolsEnabled();

    const items = useMemo(() => {
        const list: ProfileMenuItem[] = [
            {
                label: 'Team',
                icon: Users,
                href: `/team-settings`
            },
            {
                label: 'Profile',
                icon: UserCog,
                href: `/user-settings`
            }
        ];

        if (canManageAccountKeys) {
            list.push({
                label: 'Account API keys',
                icon: KeyRound,
                href: '/api-keys',
                onSelect: () => track('auth:api_keys_link_click', {})
            });
        }

        if (meta?.auditTrail && canReadAuditTrail) {
            list.push({
                label: 'Audit trail',
                icon: History,
                href: `/team/audit`
            });
        }

        if (globalEnv.features.plan) {
            list.push({
                label: 'Billing & usage',
                icon: CreditCard,
                href: `/team/billing`
            });
        }

        if (meta && meta.gettingStartedDismissed && showGettingStarted) {
            list.push({
                label: 'Getting Started',
                icon: Sprout,
                href: `/dev/getting-started`
            });
        }

        return list;
    }, [meta, showGettingStarted, canReadAuditTrail, canManageAccountKeys]);

    const initials = user?.name ? toAcronym(user.name) : '';

    if (!meta || !user) {
        return;
    }

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="group/profile flex w-full cursor-pointer items-center justify-between gap-2 rounded-ds-md p-2 outline-none transition-colors focus-inset hover:bg-state-hover data-[state=open]:bg-state-hover">
                <span className="flex min-w-0 items-center gap-3">
                    <span className="type-text-regular-xs flex size-8 shrink-0 items-center justify-center rounded-ds-full border-ds-hairline border-border-default bg-surface-overlay text-text-default">
                        {initials}
                    </span>
                    <span className="flex min-w-0 flex-col items-start">
                        <span className="type-text-medium-sm max-w-full truncate text-text-default">{user.name}</span>
                        <span className="type-text-regular-xs max-w-full truncate text-text-muted">{user.email}</span>
                    </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-icon-secondary group-hover/profile:text-icon-default group-data-[state=open]/profile:text-icon-default" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={4} className={cn(navigationMenuContentClassName, 'w-58')}>
                <div className="flex flex-col px-2 py-1.5">
                    <span className="type-text-medium-sm truncate text-text-strong">{user.name}</span>
                    <span className="type-text-regular-xs truncate text-text-muted">{user.email}</span>
                </div>
                <DropdownMenuSeparator className="mx-0 h-[0.5px] bg-border-default" />
                {items.map((item) => (
                    <DropdownMenuItem key={item.href} asChild className={navigationMenuItemClassName}>
                        <Link to={item.href} onClick={item.onSelect}>
                            <item.icon />
                            <span>{item.label}</span>
                        </Link>
                    </DropdownMenuItem>
                ))}
                {isDevToolsEnabled && (
                    <DropdownMenuItem onSelect={toggleDevPanel} className={navigationMenuItemClassName}>
                        <SlidersHorizontal />
                        <span>Dev Tools</span>
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="mx-0 h-[0.5px] bg-border-default" />
                <div className="flex h-9 items-center gap-2 pr-1 pl-2">
                    <Contrast className="size-4 shrink-0 text-icon-secondary" />
                    <span className="type-text-regular-sm flex-1 text-text-default">Theme</span>
                    <ThemeToggle />
                </div>
                <DropdownMenuSeparator className="mx-0 h-[0.5px] bg-border-default" />
                <DropdownMenuItem onSelect={() => void signout()} className={navigationMenuItemClassName}>
                    <LogOut />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
