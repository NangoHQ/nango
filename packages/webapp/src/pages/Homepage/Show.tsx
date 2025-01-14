import { Link } from 'react-router-dom';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { InsightChart } from './components/InsightChart';
import { useMeta } from '../../hooks/useMeta';
import { globalEnv } from '../../utils/env';
import { Helmet } from 'react-helmet';

export const Homepage: React.FC = () => {
    const { meta } = useMeta();
    const { user: me } = useUser();

    if (!me || !meta) {
        return null;
    }

    if (!globalEnv.features.logs) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Homepage}>
                <Helmet>
                    <title>Homepage - Nango</title>
                </Helmet>
                <div className="flex justify-between items-center">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-3xl font-semibold text-white flex gap-4 items-center">Hello, {me.name}!</h2>
                    </div>
                </div>

                <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20 mt-4">
                    <h2 className="text-xl text-center">Logs not configured</h2>
                    <div className="text-sm text-gray-400">
                        Follow{' '}
                        <Link to="https://docs.nango.dev/guides/self-hosting/free-self-hosting/overview#logs" className="text-blue-400">
                            these instructions
                        </Link>{' '}
                        to configure logs and enable execution metrics in your dashboard.
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Homepage}>
            <Helmet>
                <title>Homepage - Nango</title>
            </Helmet>
            <div className="flex justify-between items-center">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-semibold text-white flex gap-4 items-center">Hello, {me.name}!</h2>

                    <div className="text-text-light-gray text-sm">Here’s your recent activity on Nango.</div>
                </div>
                <div className="text-white text-sm">
                    Last 14 days <code className="font-code text-xs text-dark-500">(UTC)</code>
                </div>
            </div>
            <div className="grid gap-8 grid-cols-[repeat(auto-fill,minmax(300px,470px))] mt-8">
                {globalEnv.features.scripts && (
                    <InsightChart
                        title="Sync Executions"
                        type="sync:run"
                        desc=""
                        help={
                            <div>
                                No sync executions in the last 14 days.{' '}
                                <Link to="https://docs.nango.dev/guides/syncs/use-a-sync" className="underline text-white">
                                    Learn more
                                </Link>
                            </div>
                        }
                    />
                )}
                {globalEnv.features.scripts && (
                    <InsightChart
                        title="Action Executions"
                        type="action"
                        desc=""
                        help={
                            <div>
                                No action executions in the last 14 days.{' '}
                                <Link to="https://docs.nango.dev/guides/actions/use-an-action" className="underline text-white">
                                    Learn more
                                </Link>
                            </div>
                        }
                    />
                )}
                <InsightChart
                    title="Proxy Requests"
                    type="proxy"
                    desc=""
                    help={
                        <div>
                            No proxy requests sent in the last 14 days.{' '}
                            <Link to="https://docs.nango.dev/guides/individual-requests" className="underline text-white">
                                Learn more
                            </Link>
                        </div>
                    }
                />
                {globalEnv.features.scripts && (
                    <InsightChart
                        title="Webhook Executions"
                        type="webhook:incoming"
                        desc=""
                        help={
                            <div>
                                No webhook executions in the last 14 days.{' '}
                                <Link to="https://docs.nango.dev/guides/webhooks/webhooks-from-apis" className="underline text-white">
                                    Learn more
                                </Link>
                            </div>
                        }
                    />
                )}
            </div>
        </DashboardLayout>
    );
};
