import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';

export const GettingStarted: React.FC = () => {
    return <DashboardLayout selectedItem={LeftNavBarItems.GettingStarted}>hello</DashboardLayout>;
};
