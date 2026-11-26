import { useQueryState } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { DockedPanelLayout, DockedPanelMain } from '@nangohq/design-system';

import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { track } from '../../utils/analytics';
import { globalEnv } from '../../utils/env';
import { OperationPanel } from './components/OperationPanel';
import { SearchAllOperations } from './components/SearchAllOperations';
import { navigationDirection, neighbourId } from './operationNavigation';

export const LogsShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const [operationId, setOperationId] = useQueryState('operationId', { history: 'push' });
    const [loadedIds, setLoadedIds] = useState<string[]>([]);

    const onSelectOperation = (open: boolean, operationId: string) => {
        if (open) {
            track('logs:operation_view', {});
        }
        setOperationId(open ? operationId : null);
    };

    const previousId = operationId ? neighbourId(loadedIds, operationId, 'previous') : null;
    const nextId = operationId ? neighbourId(loadedIds, operationId, 'next') : null;
    const goTo = useCallback(
        (id: string | null) => {
            if (id) {
                void setOperationId(id, { history: 'replace' });
            }
        },
        [setOperationId]
    );

    useEffect(() => {
        if (!operationId) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            const direction = navigationDirection(event);
            if (!direction) {
                return;
            }
            event.preventDefault();
            goTo(direction === 'next' ? nextId : previousId);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [operationId, previousId, nextId, goTo]);

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
                        <SearchAllOperations onSelectOperation={onSelectOperation} selectedOperationId={operationId} onLoadedIdsChange={setLoadedIds} />
                    </div>
                </DockedPanelMain>
                {operationId && (
                    <OperationPanel
                        operationId={operationId}
                        onClose={() => void setOperationId(null)}
                        onPrevious={previousId ? () => goTo(previousId) : undefined}
                        onNext={nextId ? () => goTo(nextId) : undefined}
                    />
                )}
            </DockedPanelLayout>
        </DashboardLayout>
    );
};
