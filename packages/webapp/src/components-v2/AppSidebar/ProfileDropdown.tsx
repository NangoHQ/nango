import { ChevronsUpDown, CreditCard, LogOut, Sparkle, UserRoundCog, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { SidebarMenu, SidebarMenuItem } from '../ui/sidebar';
import { useMeta } from '@/hooks/useMeta';
import { useUser } from '@/hooks/useUser';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { useSignout } from '@/utils/user';

export const ProfileDropdown: React.FC = () => {
    const env = useStore((state) => state.env);
    const { meta } = useMeta();
    const navigate = useNavigate();
    const signout = useSignout();
    const { user } = useUser();
    const showGettingStarted = useStore((state) => state.showGettingStarted);

    const items = useMemo(() => {
        const list = [
            {
                label: 'Team',
                icon: Users,
                href: `/${env}/team-settings`
            },
            {
                label: 'Profile',
                icon: UserRoundCog,
                href: `/${env}/user-settings`
            }
        ];

        if (meta && meta.gettingStartedClosed && showGettingStarted) {
            list.push({
                label: 'Getting Started',
                icon: Sparkle,
                href: `/${env}/getting-started`
            });
        }

        if (globalEnv.features.plan) {
            list.push({
                label: 'Usage & Billing',
                icon: CreditCard,
                href: `/${env}/team/billing`
            });
        }

        return list;
    }, [env, meta, showGettingStarted]);

    const initials = useMemo(() => {
        if (!user?.name) {
            return '';
        }

        const nameParts = user.name.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];

        // If there's only one name part, just use the first character
        if (nameParts.length === 1) {
            return firstName[0]?.toUpperCase() || '';
        }

        // If there are multiple parts, use first character of first and last name
        return (firstName[0]?.toUpperCase() || '') + (lastName[0]?.toUpperCase() || '');
    }, [user]);

    if (!meta || !user) {
        return;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger className="group/profile cursor-pointer h-fit w-full p-3 inline-flex items-center justify-between bg-dropdown-bg-default hover:bg-dropdown-bg-hover active:bg-dropdown-bg-press border-t-[0.5px] border-border-muted">
                        <div className="inline-flex gap-2">
                            <div className="size-10 flex items-center justify-center rounded bg-bg-surface border border-border-muted text-text-primary leading-5">
                                {initials}
                            </div>
                            <div className="flex flex-col gap-1 items-start">
                                <span className="text-sm font-semibold text-text-primary truncate max-w-28 ">{user?.name}</span>
                                <span className="text-text-secondary text-s leading-3 pb-px truncate max-w-28">{user?.email}</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="size-4.5 text-text-tertiary group-hover/profile:text-text-secondary group-active/profile:text-text-primary" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" alignOffset={0} side="right" className="w-50 p-2">
                        {items.map((item, index) => (
                            <DropdownMenuItem
                                key={index}
                                onSelect={() => navigate(item.href)}
                                className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary hover:bg-dropdown-bg-hover hover:text-text-primary"
                            >
                                <item.icon className="size-4 text-text-secondary group-hover:text-text-primary" />
                                <span>{item.label}</span>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                            onSelect={() => signout()}
                            className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary hover:bg-dropdown-bg-hover hover:text-text-primary"
                        >
                            <LogOut className="size-4 text-text-secondary group-hover:text-text-primary" />
                            <span>Log Out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
