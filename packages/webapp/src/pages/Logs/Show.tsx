import { useQueryState } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { DockedPanelLayout, DockedPanelMain } from '@nangohq/design-system';

import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { track } from '../../utils/analytics';
import { globalEnv } from '../../utils/env';
import { formatQuantity } from '../../utils/utils';
import { OperationPanel } from './components/OperationPanel';
import { OperationsToolbar } from './components/OperationsToolbar';
import { SearchAllOperations } from './components/SearchAllOperations';
import { navigationDirection, neighbourId } from './operationNavigation';

function focusedRowId(target: EventTarget | null): string | null {
    return target instanceof HTMLElement ? (target.closest<HTMLElement>('tr[data-operation-id]')?.dataset['operationId'] ?? null) : null;
}

export const LogsShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const [operationId, setOperationId] = useQueryState('operationId', { history: 'push' });
    const [loadedIds, setLoadedIds] = useState<string[]>([]);

    const onSelectOperation = useCallback(
        (open: boolean, id: string) => {
            if (open) {
                track('logs:operation_view', {});
            }
            void setOperationId(open ? id : null);
        },
        [setOperationId]
    );

    const [total, setTotal] = useState(0);
    const [lastOperationId, setLastOperationId] = useState<string | null>(null);
    useEffect(() => {
        if (operationId) {
            setLastOperationId(operationId);
        }
    }, [operationId]);
    const cursorId = operationId ?? (lastOperationId && loadedIds.includes(lastOperationId) ? lastOperationId : null);
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
        const onKeyDown = (event: KeyboardEvent) => {
            const rowId = focusedRowId(event.target);
            const enterId = rowId ?? (event.target === document.body ? cursorId : null);
            if (event.key === 'Enter' && !operationId && enterId) {
                event.preventDefault();
                onSelectOperation(true, enterId);
                return;
            }
            const direction = navigationDirection(event);
            if (!direction || (!operationId && !rowId && event.target !== document.body)) {
                return;
            }
            const id = neighbourId(loadedIds, operationId ?? rowId ?? cursorId, direction);
            if (!id) {
                return;
            }
            event.preventDefault();
            if (operationId) {
                goTo(id);
            } else {
                onSelectOperation(true, id);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [operationId, cursorId, loadedIds, goTo, onSelectOperation]);

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

            <div key={env} className="flex h-full min-h-0 flex-col gap-3 pt-5">
                <div className="px-5">
                    <OperationsToolbar count={`${formatQuantity(total)} ${total === 1 ? 'log' : 'logs'} found`} />
                </div>
                <DockedPanelLayout>
                    <DockedPanelMain>
                        <SearchAllOperations
                            onSelectOperation={onSelectOperation}
                            selectedOperationId={operationId}
                            tabStopOperationId={cursorId}
                            onLoadedIdsChange={setLoadedIds}
                            onTotalChange={setTotal}
                            panelOpen={Boolean(operationId)}
                        />
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
            </div>
        </DashboardLayout>
    );
};
