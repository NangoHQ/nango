import { LeftNavBarItems } from '../../components/LeftNavBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { InsightChart } from './components/InsightChart';

export const Homepage: React.FC = () => {
    const { user, loading } = useUser();
    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs} fullWidth className="p-6">
                <h2 className="text-3xl font-semibold text-white mb-4">Welcome</h2>

                <div className="flex gap-2 flex-col">
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                </div>
            </DashboardLayout>
        );
    }
    if (!user) {
        return null;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Homepage}>
            <h2 className="text-3xl font-semibold text-white flex gap-4 items-center">Hello, {user.name}!</h2>

            <div className="grid gap-8 grid-cols-[repeat(auto-fill,minmax(300px,470px))] mt-8">
                <InsightChart title="Sync" type="sync" desc="Sync executions" />
                <InsightChart title="Action" type="action" desc="Action executions" />
                <InsightChart title="Proxy" type="proxy" desc="Proxy requests" />
                <InsightChart title="Webhook" type="webhook_external" desc="External webhooks received" />
            </div>
        </DashboardLayout>
    );
};
