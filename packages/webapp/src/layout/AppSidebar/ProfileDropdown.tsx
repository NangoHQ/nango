import { ChevronsUpDown, CreditCard, LogOut, SlidersHorizontal, Sparkle, UserRoundCog, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/Sidebar';
import { useDevPanelStore, useIsDevToolsEnabled } from '@/features/DevToolPanel';
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

        return list;
    }, [meta, showGettingStarted]);

    const initials = user?.name ? toAcronym(user.name) : '';

    if (!meta || !user) {
        return;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger className="group/profile cursor-pointer h-fit w-full p-3 inline-flex items-center justify-between bg-surface-overlay hover:bg-state-hover data-[state=open]:bg-surface-overlay border-t-[0.5px] border-border-muted">
                        <div className="inline-flex gap-2 items-center">
                            <div className="size-10 flex items-center justify-center rounded bg-surface-canvas border border-border-muted text-text-strong leading-5">
                                {initials}
                            </div>
                            <div className="flex flex-col gap-1 items-start">
                                <span className="text-body-medium-semi leading-4 text-text-strong truncate max-w-28 ">{user?.name}</span>
                                <span className="text-body-small-regular leading-3 text-text-secondary pb-px truncate max-w-28">{user?.email}</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="size-4.5 text-text-muted group-hover/profile:text-text-secondary group-active/profile:text-text-strong" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" alignOffset={0} side="right" sideOffset={0} className="w-50 p-2">
                        {items.map((item, index) => (
                            <DropdownMenuItem
                                key={index}
                                onSelect={() => navigate(item.href)}
                                className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary text-body-medium-medium hover:bg-state-hover hover:text-text-strong"
                            >
                                <item.icon className="size-4 text-text-secondary group-hover:text-text-strong" />
                                <span>{item.label}</span>
                            </DropdownMenuItem>
                        ))}
                        {isDevToolsEnabled && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onSelect={toggleDevPanel}
                                    className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary text-body-medium-medium hover:bg-state-hover hover:text-text-strong"
                                >
                                    <SlidersHorizontal className="size-4 text-text-secondary group-hover:text-text-strong" />
                                    <span>Dev Tools</span>
                                </DropdownMenuItem>
                            </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() => signout()}
                            className="group cursor-pointer flex flex-row items-center gap-2 text-text-secondary text-body-medium-medium hover:bg-state-hover hover:text-text-strong"
                        >
                            <LogOut className="size-4 text-text-secondary group-hover:text-text-strong" />
                            <span>Log Out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
