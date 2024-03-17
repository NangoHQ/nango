import { DebugMode } from '../components/DebugMode';
import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import TopNavBar from '../components/TopNavBar';

interface DashboardLayoutI {
    children: React.ReactNode;
    selectedItem: LeftNavBarItems;
    marginBottom?: number;
}

export default function DashboardLayout({ children, selectedItem, marginBottom = 24 }: DashboardLayoutI) {
    return (
        <div className="h-full min-h-screen">
            <DebugMode />
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={selectedItem} />
                <div className="flex justify-center mt-8 w-full mx-auto overflow-auto bg-pure-black">
                    <div className={`w-[976px] mt-16 mb-${marginBottom} min-h-screen h-full`}>{children}</div>
                </div>
            </div>
        </div>
    );
}
