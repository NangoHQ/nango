import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/Sidebar';
import { Playground } from '@/features/Playground';
import { AppHeader } from '@/layout/AppHeader';
import { cn } from '@/utils/utils';
import { AppSidebar } from './AppSidebar';
import { SectionHeader } from './SectionHeader';

interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    fullWidth?: boolean;
    /** Section title rendered in the fixed header below the top bar. Omit to hide the section header. */
    title?: string;
    /** Optional badge rendered inline after the section title (e.g. an environment badge). */
    titleBadge?: React.ReactNode;
    /** Optional action rendered on the right of the section header (e.g. the page's primary button). */
    titleActions?: React.ReactNode;
    /** Extra classes for the section header's inner row, e.g. the page's content max-width so the actions line up with it. */
    headerClassName?: string;
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(
    ({ children, className, fullWidth = false, title, titleBadge, titleActions, headerClassName, ...props }, ref) => {
        return (
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="max-h-screen overflow-hidden">
                    <AppHeader />
                    {title != null && <SectionHeader title={title} badge={titleBadge} actions={titleActions} className={headerClassName} />}
                    <div
                        ref={ref}
                        className={cn('relative w-full flex-1 min-h-0 overflow-auto bg-surface-page min-w-3xl', fullWidth ? 'p-0' : 'p-11')}
                        {...props}
                    >
                        <div className={cn('grow h-auto mx-auto w-full', fullWidth ? 'p-6' : 'min-w-[968px] max-w-[1056px]', className)}>{children}</div>
                        <Playground />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        );
    }
);

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;
