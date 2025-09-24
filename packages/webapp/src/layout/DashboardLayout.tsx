import React from 'react';

import { AppSidebar } from '../components-v2/AppSidebar';
import { AppHeader } from '@/components-v2/AppHeader';
import { SidebarInset, SidebarProvider } from '@/components-v2/ui/sidebar';
import { cn } from '@/utils/utils';

interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    fullWidth?: boolean;
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(({ children, className, fullWidth = false, ...props }, ref) => {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="max-h-screen overflow-hidden">
                <AppHeader />
                <div ref={ref} className={cn('w-full h-full overflow-auto rounded-tl-sm border border-border-muted bg-bg-surface')} {...props}>
                    <div className={cn('grow h-auto mx-auto px-8', fullWidth ? 'w-full' : 'w-[976px] py-8', className)}>{children}</div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
});

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;
