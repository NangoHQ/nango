import { Contrast, LogOut, UserCog } from 'lucide-react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { navigationMenuContentClassName, navigationMenuItemClassName, navigationMenuSeparatorClassName } from '@/layout/AppSidebar/navigationMenu';
import { ThemeSwitcher } from '@/layout/AppSidebar/ThemeSwitcher';
import { cn } from '@/utils/utils';
import { Button } from '../src/components/ui/button';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'App Components/Layout/ThemeSwitcher',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

/** The Profile menu's theme row, as in `ProfileDropdown`. Picking a theme keeps the menu open. */
export const InProfileMenu: Story = {
    render: () => (
        <DropdownMenu defaultOpen>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md">
                    Profile
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" sideOffset={4} className={cn(navigationMenuContentClassName, 'w-58')}>
                <DropdownMenuItem className={navigationMenuItemClassName}>
                    <UserCog />
                    <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className={navigationMenuSeparatorClassName} />
                <div className="flex h-9 items-center gap-2 pr-1 pl-2">
                    <Contrast className="size-4 shrink-0 text-icon-secondary" />
                    <span className="type-text-regular-sm flex-1 text-text-default">Theme</span>
                    <ThemeSwitcher />
                </div>
                <DropdownMenuSeparator className={navigationMenuSeparatorClassName} />
                <DropdownMenuItem className={navigationMenuItemClassName}>
                    <LogOut />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
};
