import { useQueryState } from 'nuqs';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { DockedPanelLayout, DockedPanelMain } from '@nangohq/design-system';

import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { track } from '../../utils/analytics';
import { globalEnv } from '../../utils/env';
import { OperationPanel } from './components/OperationPanel';
import { SearchAllOperations } from './components/SearchAllOperations';

export const LogsShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const [operationId, setOperationId] = useQueryState('operationId', { history: 'push' });

    // Operation select
    const onSelectOperation = (open: boolean, operationId: string) => {
        if (open) {
            track('logs:operation_view', {});
        }
        setOperationId(open ? operationId : null);
    };

    if (!globalEnv.features.logs) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Logs - Nango</title>
                </Helmet>
                <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
                    <h2 className="text-xl text-center">Logs not configured</h2>
                    <div className="text-sm text-text-muted">
                        Follow{' '}
                        <Link to="https://nango.dev/docs/guides/platform/self-hosting/self-managed#logs" className="text-text-link">
                            these instructions
                        </Link>{' '}
                        to configure logs.
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout className="h-full p-0">
            <Helmet>
                <title>Logs - Nango</title>
            </Helmet>

            <DockedPanelLayout key={env}>
                <DockedPanelMain>
                    <div className="flex h-full min-h-0 flex-col p-5">
                        <SearchAllOperations onSelectOperation={onSelectOperation} selectedOperationId={operationId} />
                    </div>
                </DockedPanelMain>
                {operationId && <OperationPanel operationId={operationId} onClose={() => void setOperationId(null)} />}
            </DockedPanelLayout>
        </DashboardLayout>
    );
};
