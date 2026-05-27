import React from 'react';

import { AppSidebar } from '../components-v2/AppSidebar';
import { AppHeader } from '@/components-v2/AppHeader';
import { Playground } from '@/components-v2/Playground';
import { SectionHeader } from '@/components-v2/SectionHeader';
import { SidebarProvider } from '@/components-v2/ui/sidebar';
import { cn } from '@/utils/utils';

interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    fullWidth?: boolean;
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(({ children, className, fullWidth = false, ...props }, ref) => {
    return (
        <SidebarProvider data-theme="dark" style={{ '--sidebar-width': '220px' } as React.CSSProperties}>
            <AppSidebar />
            <main className="flex flex-1 flex-col min-w-0 max-h-screen overflow-hidden bg-surface-page">
                <AppHeader />
                <SectionHeader />
                <div ref={ref} className={cn('flex-1 overflow-auto', fullWidth ? 'p-0' : 'p-6')} {...props}>
                    <div className={cn('mx-auto w-full', className)}>{children}</div>
                    <Playground />
                </div>
            </main>
        </SidebarProvider>
    );
});

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;
