import { forwardRef } from 'react';

import { DebugMode } from '../components/DebugMode';
import LeftNavBar from '../components/LeftNavBar';
import TopNavBar from '../components/TopNavBar';
import { cn } from '../utils/utils';

import type { LeftNavBarItems } from '../components/LeftNavBar';
import type { ClassValue } from 'clsx';

interface DashboardLayoutI {
    children: React.ReactNode;
    selectedItem: LeftNavBarItems;
    fullWidth?: boolean;
    className?: ClassValue;
}

const DashboardLayout = forwardRef<HTMLDivElement, DashboardLayoutI>(function DashboardLayout({ children, selectedItem, fullWidth = false, className }, ref) {
    return (
        <div className="h-full min-h-screen flex bg-pure-black overflow-hidden">
            <div className="absolute w-screen z-20">
                <DebugMode />
            </div>
            <div className="w-[250px] h-screen z-10 grow-0">
                <LeftNavBar selectedItem={selectedItem} />
            </div>
            <div className="grow relative h-screen flex flex-col">
                <div className="h-[57px] w-full">
                    <TopNavBar />
                </div>
                <div className="h-full overflow-auto" ref={ref}>
                    <div className={cn('grow h-auto mx-auto', fullWidth ? 'w-full' : 'w-[976px] py-8', className)}>{children}</div>
                </div>
            </div>
        </div>
    );
});

export default DashboardLayout;
