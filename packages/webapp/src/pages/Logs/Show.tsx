import { useQueryState } from 'nuqs';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { EmptyCard } from '../../components/ui/EmptyCard';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { globalEnv } from '../../utils/env';
import { OperationDrawer } from './components/OperationDrawer';
import { SearchAllOperations } from './components/SearchAllOperations';

export const LogsShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const [operationId, setOperationId] = useQueryState('operationId', { history: 'push' });

    // Operation select
    const onSelectOperation = (open: boolean, operationId: string) => {
        setOperationId(open ? operationId : null);
    };

    if (!globalEnv.features.logs) {
        return (
            <DashboardLayout fullWidth title="Logs">
                <Helmet>
                    <title>Logs - Nango</title>
                </Helmet>
                <EmptyCard className="text-center text-text-strong">
                    <h2 className="text-xl text-center">Logs not configured</h2>
                    <div className="text-sm text-text-muted">
                        Follow{' '}
                        <Link to="https://nango.dev/docs/guides/platform/self-hosting#logs" className="text-text-link">
                            these instructions
                        </Link>{' '}
                        to configure logs.
                    </div>
                </EmptyCard>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth title="Logs" className="h-full">
            <Helmet>
                <title>Logs - Nango</title>
            </Helmet>

            <div key={env} className="flex flex-col h-full">
                <SearchAllOperations onSelectOperation={onSelectOperation} />

                {operationId && <OperationDrawer key={operationId} operationId={operationId} onClose={onSelectOperation} />}
            </div>
        </DashboardLayout>
    );
};
