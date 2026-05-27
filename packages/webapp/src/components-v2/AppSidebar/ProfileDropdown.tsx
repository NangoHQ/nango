import { ChevronsUpDown, CreditCard, LogOut, Sparkle, UserRoundCog, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useMeta } from '@/hooks/useMeta';
import { useUser } from '@/hooks/useUser';
import { useStore } from '@/store';
import { toAcronym } from '@/utils/avatar';
import { globalEnv } from '@/utils/env';
import { useSignout } from '@/utils/user';

export const ProfileDropdown: React.FC = () => {
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const navigate = useNavigate();
    const signout = useSignout();
    const { user } = useUser();
    const showGettingStarted = useStore((state) => state.showGettingStarted);

    const items = useMemo(() => {
        const list = [
            { label: 'Team', icon: Users, href: `/team-settings` },
            { label: 'Profile', icon: UserRoundCog, href: `/user-settings` }
        ];

        if (meta && meta.gettingStartedClosed && showGettingStarted) {
            list.push({ label: 'Getting Started', icon: Sparkle, href: `/dev/getting-started` });
        }

        if (globalEnv.features.plan) {
            list.push({ label: 'Billing & usage', icon: CreditCard, href: `/team/billing` });
        }

        return list;
    }, [meta, showGettingStarted]);

    const initials = user?.name ? toAcronym(user.name) : '';

    if (!meta || !user) {
        return;
    }

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="flex h-14 w-full cursor-pointer items-center justify-between border-b border-t border-[color:var(--border-default)] bg-transparent px-4 outline-none hover:bg-[var(--state-hover)] data-[state=open]:bg-[var(--state-hover)]">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-default)] bg-[var(--surface-overlay)] text-[12px] font-medium text-text-default">
                        {initials}
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="max-w-28 truncate text-[13px] font-medium leading-none text-text-default">{user?.name}</span>
                        <span className="mt-0.5 max-w-28 truncate text-[12px] leading-none tracking-tight text-text-muted">{user?.email}</span>
                    </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-default" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" alignOffset={0} side="right" sideOffset={0} className="w-50 p-2">
                {items.map((item, index) => (
                    <DropdownMenuItem
                        key={index}
                        onSelect={() => navigate(item.href)}
                        className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary text-body-medium-medium hover:bg-dropdown-bg-hover hover:text-text-primary"
                    >
                        <item.icon className="size-4 text-text-secondary group-hover:text-text-primary" />
                        <span>{item.label}</span>
                    </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                    onSelect={() => signout()}
                    className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary text-body-medium-medium hover:bg-dropdown-bg-hover hover:text-text-primary"
                >
                    <LogOut className="size-4 text-text-secondary group-hover:text-text-primary" />
                    <span>Log Out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
