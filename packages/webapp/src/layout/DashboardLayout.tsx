import type { ClassValue } from 'clsx';
import { DebugMode } from '../components/DebugMode';
import type { LeftNavBarItems } from '../components/LeftNavBar';
import LeftNavBar from '../components/LeftNavBar';
import TopNavBar from '../components/TopNavBar';
import { cn } from '../utils/utils';
import { forwardRef } from 'react';

interface DashboardLayoutI {
    children: React.ReactNode;
    selectedItem: LeftNavBarItems;
    fullWidth?: boolean;
    className?: ClassValue;
}

const DashboardLayout = forwardRef<HTMLDivElement, DashboardLayoutI>(function DashboardLayout({ children, selectedItem, fullWidth = false, className }, ref) {
    return (
        <div className="h-full min-h-screen flex bg-pure-black">
            <div className="absolute w-screen z-20">
                <DebugMode />
            </div>
            <div className="w-[250px] h-screen z-10 flex-grow-0">
                <LeftNavBar selectedItem={selectedItem} />
            </div>
            <div className="flex-grow relative h-screen flex flex-col">
                <div className="h-[57px] w-full">
                    <TopNavBar />
                </div>
                <div className="h-full overflow-auto" ref={ref}>
                    <div className={cn('flex-grow h-auto mx-auto', fullWidth ? 'w-full' : 'w-[976px] py-8', className)}>{children}</div>
                </div>
            </div>
        </div>
    );
});

export default DashboardLayout;
