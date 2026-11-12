import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/Sidebar';
import { FunctionPlaygroundDrawer } from '@/features/Playground';
import { useViewport } from '@/hooks/useViewport';
import { AppHeader } from '@/layout/AppHeader';
import { cn } from '@/utils/utils';
import { AppSidebar } from './AppSidebar';

// A 14-inch MacBook Pro's content width: its 1512px viewport less the sidebar and the page padding.
const CENTERED_MAX_WIDTH = 'max-w-[1240px]';

interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    fullWidth?: boolean;
    /** The page's actions, shown on the right of the top bar. */
    actions?: React.ReactNode;
    /** A `PageHeader` row under the top bar, for pages about a single entity. Its title becomes the page's `h1`. */
    pageHeader?: React.ReactNode;
    /** The page renders its own `h1`, so the breadcrumb shouldn't. Implied by `pageHeader`. */
    hasPageHeading?: boolean;
    breadcrumbLabel?: string;
    /** Caps and centers the page content. Use on `fullWidth` pages whose content doesn't read well edge-to-edge on a wide screen. */
    centered?: boolean;
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(
    ({ children, className, fullWidth = false, actions, pageHeader, hasPageHeading = false, breadcrumbLabel, centered = false, ...props }, ref) => {
        useViewport('desktop');

        return (
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="max-h-screen overflow-hidden">
                    <AppHeader actions={actions} breadcrumbIsHeading={!pageHeader && !hasPageHeading} breadcrumbLabel={breadcrumbLabel} />
                    {pageHeader}
                    <div
                        ref={ref}
                        className={cn('relative w-full flex-1 min-h-0 overflow-auto bg-surface-page min-w-3xl', fullWidth ? 'p-0' : 'p-11')}
                        {...props}
                    >
                        <div className={cn('grow h-auto mx-auto w-full', fullWidth ? 'p-6' : 'min-w-[968px] max-w-[1056px]', className)}>
                            {centered ? <div className={cn('mx-auto w-full', CENTERED_MAX_WIDTH)}>{children}</div> : children}
                        </div>
                        <FunctionPlaygroundDrawer />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        );
    }
);

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;
