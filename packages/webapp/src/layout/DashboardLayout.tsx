import { forwardRef } from 'react';

import { AppSidebar } from '../components-v2/AppSidebar';
import { SidebarProvider } from '@/components-v2/ui/sidebar';

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
        <SidebarProvider className="bg-nav-gradient">
            <AppSidebar />
            <main className="w-full rounded-tl-sm bg-background-surface p-11">{children}</main>
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
