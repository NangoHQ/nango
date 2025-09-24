import { forwardRef } from 'react';

import { AppSidebar } from '../components-v2/AppSidebar';
import { AppHeader } from '@/components-v2/AppHeader';
import { SidebarInset, SidebarProvider } from '@/components-v2/ui/sidebar';

import type { LeftNavBarItems } from '../components/LeftNavBar';
import type { ClassValue } from 'clsx';

interface DashboardLayoutI {
    children: React.ReactNode;
    selectedItem: LeftNavBarItems;
    fullWidth?: boolean;
    className?: ClassValue;
}

const DashboardLayout = forwardRef<HTMLDivElement, DashboardLayoutI>(function DashboardLayout({ children }, _) {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="max-h-screen overflow-hidden">
                <AppHeader />
                <div className="w-full h-full overflow-auto rounded-tl-sm border border-border-muted bg-background-surface p-11">{children}</div>
            </SidebarInset>
        </SidebarProvider>
    );
});

export default DashboardLayout;
