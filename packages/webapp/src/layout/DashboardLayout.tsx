import React from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/Sidebar';
import { Playground } from '@/features/Playground';
import { AppHeader } from '@/layout/AppHeader';
import { cn } from '@/utils/utils';
import { AppSidebar } from './AppSidebar';
import { CENTERED_MAX_WIDTH, SectionHeader } from './SectionHeader';

interface DashboardLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
    fullWidth?: boolean;
    /** Section title rendered in the fixed header below the top bar. Omit to hide the section header. */
    title?: string;
    /** Optional badge rendered inline after the section title (e.g. an environment badge). */
    titleBadge?: React.ReactNode;
    /** Optional action rendered on the right of the section header (e.g. the page's primary button). */
    titleActions?: React.ReactNode;
    /**
     * Caps and centers the page content *and* the section header row at the same width, so the title
     * and its action line up with the content's edges. Use on `fullWidth` pages whose content doesn't
     * read well edge-to-edge on a wide screen.
     */
    centered?: boolean;
}

const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(
    ({ children, className, fullWidth = false, title, titleBadge, titleActions, centered = false, ...props }, ref) => {
        return (
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="max-h-screen overflow-hidden">
                    <AppHeader />
                    {title != null && <SectionHeader title={title} badge={titleBadge} actions={titleActions} centered={centered} />}
                    <div
                        ref={ref}
                        className={cn('relative w-full flex-1 min-h-0 overflow-auto bg-surface-page min-w-3xl', fullWidth ? 'p-0' : 'p-11')}
                        {...props}
                    >
                        <div className={cn('grow h-auto mx-auto w-full', fullWidth ? 'p-6' : 'min-w-[968px] max-w-[1056px]', className)}>
                            {/* Mirrors SectionHeader's inner row: same cap inside the same padding, so the two line up */}
                            {centered ? <div className={cn('mx-auto w-full', CENTERED_MAX_WIDTH)}>{children}</div> : children}
                        </div>
                        <Playground />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        );
    }
);

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;
