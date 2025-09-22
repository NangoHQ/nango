import { ChevronsUpDown, CreditCard, LogOut, UserRoundCog, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { SidebarMenu, SidebarMenuItem } from './ui/sidebar';
import { useMeta } from '@/hooks/useMeta';
import { useStore } from '@/store';
import { useSignout } from '@/utils/user';

export const ProfileDropdown: React.FC = () => {
    const env = useStore((state) => state.env);
    const { meta } = useMeta();
    const navigate = useNavigate();
    const signout = useSignout();

    const items = useMemo(
        () => [
            {
                label: 'Team',
                icon: Users,
                href: `/${env}/team-settings`
            },
            {
                label: 'Profile',
                icon: UserRoundCog,
                href: `/${env}/user-settings`
            },
            {
                label: 'Usage & Billing',
                icon: CreditCard,
                href: `/${env}/team/billing`
            }
        ],
        [env]
    );

    if (!meta) {
        return;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger className="group/profile cursor-pointer h-fit w-full p-2.5 inline-flex items-center justify-between bg-dropdown-bg-default active:bg-dropdown-bg-press">
                        <div className="inline-flex gap-2">
                            <div className="size-10 flex items-center justify-center rounded bg-bg-muted border border-border-muted text-text-primary leading-5 group-hover/profile:bg-background-surface group-active/profile:bg-bg-muted">
                                GH
                            </div>
                            <div className="flex flex-col gap-1 items-start">
                                <span className="text-sm font-semibold text-text-primary truncate max-w-28 ">Khaliq Gant da Silva Costa</span>
                                <span className="text-text-secondary text-s leading-3 pb-px truncate max-w-28">khaliq@nango.dev</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="size-4.5 text-text-tertiary group-hover/profile:text-text-secondary group-active/profile:text-text-primary" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" alignOffset={0} side="right" className="w-50 p-2">
                        {items.map((item, index) => (
                            <DropdownMenuItem
                                key={index}
                                onSelect={() => navigate(item.href)}
                                className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary hover:text-text-primary"
                            >
                                <item.icon className="size-5 text-text-secondary group-hover:text-text-primary" />
                                <span>{item.label}</span>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                            onSelect={() => signout()}
                            className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary hover:text-text-primary"
                        >
                            <LogOut className="size-5 text-text-secondary group-hover:text-text-primary" />
                            <span>Log Out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
