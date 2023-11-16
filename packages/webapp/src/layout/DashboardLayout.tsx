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
                <div className="ml-60 pt-14 mx-auto">{children}</div>
            </div>
        </div>
    );
}
