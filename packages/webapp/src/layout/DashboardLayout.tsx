import { forwardRef } from 'react';

import { AppSidebar } from '../components-v2/AppSidebar';
import TopNavBar from '@/components/TopNavBar';
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
            <SidebarInset className="max-h-screen overflow-y-scroll">
                <TopNavBar />
                <div className="w-full rounded-tl-sm border border-border-muted bg-background-surface p-11">{children}</div>
            </SidebarInset>
        </SidebarProvider>
    );
    // return (
    //     <div className="h-full min-h-screen flex bg-linear-to-br from-background-elevated to-background-surface">
    //         <div className="absolute w-screen z-20">
    //             <DebugMode />
    //         </div>
    //         <div className="z-10 grow-0">
    //             <LeftNavBar />
    //         </div>
    //         <div className="grow relative h-screen flex flex-col">
    //             <div className="h-[57px] w-full">
    //                 <TopNavBar />
    //             </div>
    //             <div className="h-full overflow-auto" ref={ref}>
    //                 <div className={cn('grow h-auto mx-auto bg-black w-full', className)}>{children}</div>
    //             </div>
    //         </div>
    //     </div>
    // );
});

export default DashboardLayout;
