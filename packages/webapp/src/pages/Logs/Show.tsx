import { useQueryState } from 'nuqs';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { OperationDrawer } from './components/OperationDrawer';
import { SearchAllOperations } from './components/SearchAllOperations';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { globalEnv } from '../../utils/env';

export const LogsShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const [operationId, setOperationId] = useQueryState('operationId', { history: 'push' });

    // Operation select
    const onSelectOperation = (open: boolean, operationId: string) => {
        setOperationId(open ? operationId : null);
    };

    if (!globalEnv.features.logs) {
        return (
            <DashboardLayout fullWidth className="p-6">
                <Helmet>
                    <title>Logs - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-white mb-4">Logs</h2>
                <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-xl text-center">Logs not configured</h2>
                    <div className="text-sm text-gray-400">
                        Follow{' '}
                        <Link to="https://docs.nango.dev/guides/self-hosting/free-self-hosting/overview#logs" className="text-blue-400">
                            these instructions
                        </Link>{' '}
                        to configure logs.
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth className="p-6 h-full">
            <Helmet>
                <title>Logs - Nango</title>
            </Helmet>

            <div key={env} className="h-full">
                <SearchAllOperations onSelectOperation={onSelectOperation} />

                {operationId && <OperationDrawer key={operationId} operationId={operationId} onClose={onSelectOperation} />}
            </div>
        </DashboardLayout>
    );
};
