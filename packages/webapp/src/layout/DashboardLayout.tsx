import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/Sidebar';
import { FunctionPlaygroundDrawer } from '@/features/Playground';
import { useViewport } from '@/hooks/useViewport';
import { AppHeader } from '@/layout/AppHeader';
import { cn } from '@/utils/utils';
import { AppSidebar } from './AppSidebar';

// Caps include the `p-5` padding, so `narrow` leaves 768px of content.
const WIDTH_CLASSES = {
    full: '',
    wide: 'max-w-[1280px]',
    narrow: 'max-w-[808px]'
} as const;

interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    /** The page's actions, shown on the right of the top bar. */
    actions?: React.ReactNode;
    /** A `PageHeader` row under the top bar, for pages about a single entity. Its title becomes the page's `h1`. */
    pageHeader?: React.ReactNode;
    /** The page renders its own `h1`, so the breadcrumb shouldn't. Implied by `pageHeader`. */
    hasPageHeading?: boolean;
    breadcrumbLabel?: string;
    /** `wide` for forms and documents, `narrow` for a single column like a chat or a stepper. */
    width?: keyof typeof WIDTH_CLASSES;
    secondaryNav?: React.ReactNode;
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(
    ({ children, className, actions, pageHeader, hasPageHeading = false, breadcrumbLabel, width = 'full', secondaryNav, ...props }, ref) => {
        useViewport('desktop');

        return (
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="max-h-screen overflow-hidden">
                    <AppHeader actions={actions} breadcrumbIsHeading={!pageHeader && !hasPageHeading} breadcrumbLabel={breadcrumbLabel} />
                    {pageHeader}
                    <div className="flex min-h-0 flex-1">
                        {secondaryNav}
                        <div
                            ref={ref}
                            // `SidebarInset` clips overflow. With a secondary nav, the nav and the pane together keep the same 768px minimum.
                            className={cn('relative flex-1 overflow-auto bg-surface-page', secondaryNav ? 'min-w-137' : 'min-w-3xl')}
                            {...props}
                        >
                            <div className={cn('mx-auto h-auto w-full p-5', WIDTH_CLASSES[width], className)}>{children}</div>
                            <FunctionPlaygroundDrawer />
                        </div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        );
    }
);

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;
