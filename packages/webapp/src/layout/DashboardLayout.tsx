import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import TopNavBar from '../components/TopNavBar';

interface DashboardLayoutI {
    children: React.ReactNode;
    selectedItem: LeftNavBarItems;
}

export default function DashboardLayout({ children, selectedItem }: DashboardLayoutI) {
    return (
        <div className="h-full overflow-hidden">
            <TopNavBar />
            <div className="flex h-full items-stretch">
                <LeftNavBar selectedItem={selectedItem} />
                <div className="w-full overflow-y-scroll">
                    <div className="p-16 mb-16 mr-auto max-w-6xl">{children}</div>
                </div>
            </div>
        </div>
    );
}
