import LeftNavBar, { LeftNavBarItems } from '../components/LeftNavBar';
import TopNavBar from '../components/TopNavBar';

interface DashboardLayoutI {
    children: React.ReactNode;
    selectedItem: LeftNavBarItems;
}

export default function DashboardLayout({ children, selectedItem }: DashboardLayoutI) {
    return (
        <div className="h-full">
            <TopNavBar />
            <div className="flex h-full">
                <LeftNavBar selectedItem={selectedItem} />
                <div className="flex justify-center mt-8 w-full mx-auto overflow-auto">
                    <div className="w-[976px] mt-16">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
