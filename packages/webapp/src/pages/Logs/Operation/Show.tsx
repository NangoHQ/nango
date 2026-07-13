import { Prism } from '@mantine/prism';
import { Calendar, Clock, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInterval } from 'react-use';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useGetOperation } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { formatDateToLogFormat, getRunTime } from '../../../utils/utils';
import { OperationTag } from '../components/OperationTag';
import { ProviderTag } from '../components/ProviderTag';
import { StatusTag } from '../components/StatusTag';
import { Logs } from './components/Logs';

export const ShowOperation: React.FC<{ operationId: string }> = ({ operationId }) => {
    const env = useStore((state) => state.env);
    const { operation, loading, error, trigger } = useGetOperation(env, { operationId });

    const duration = useMemo<string>(() => {
        if (!operation) {
            return '';
        }
        if (!operation.endedAt || !operation.startedAt) {
            return 'n/a';
        }

        return getRunTime(new Date(operation.startedAt).toISOString(), new Date(operation.endedAt).toISOString());
    }, [operation]);

    const createdAt = useMemo(() => {
        return operation?.createdAt ? formatDateToLogFormat(operation?.createdAt) : 'n/a';
    }, [operation?.createdAt]);

    const isLive = useMemo(() => {
        // We keep refreshing N seconds after end to catch logs that could be indexed after the operation is done
        return !operation || !operation.endedAt || new Date(operation.endedAt).getTime() > Date.now() - 160_000;
    }, [operation]);

    const payload = useMemo(() => {
        if (!operation?.meta && !operation?.request && !operation?.response) {
            return null;
        }

        const pl: Record<string, any> = operation.meta ? { ...operation.meta } : {};
        if (operation.request) {
            pl.request = operation.request;
        }
        if (operation.response) {
            pl.response = operation.response;
        }
        if (operation.error) {
            pl.error = { message: operation.error.message };
            if (operation.error.payload) {
                pl.error.payload = operation.error.payload;
            }
        }
        return pl;
    }, [operation?.meta, operation?.request, operation?.response]);

    useInterval(
        () => {
            // Auto refresh
            trigger();
        },
        isLive ? 5000 : null
    );

    const darkMode = useThemeStore(darkModeSelector);

    if (loading) {
        return (
            <div className="py-6 px-6 flex flex-col gap-9">
                <h3 className="text-xl font-semibold text-text-strong flex gap-4 items-center">Operation Details</h3>
                <Skeleton className="w-[250px]" />
                <Skeleton className="w-[250px]" />
                <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Payload</h4>
                    <Skeleton className="w-[250px]" />
                </div>
                <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Logs</h4>
                    <Skeleton className="w-[250px]" />
                </div>
            </div>
        );
    }

    if (error || !operation) {
        return (
            <div className="py-6 px-6 flex flex-col gap-9">
                <Alert variant="error">
                    <AlertDescription>An error occurred</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="py-8 px-6 flex flex-col gap-5 h-screen">
            <header className="flex gap-2 flex-col border-b border-b-border-muted pb-5">
                <h3 className="text-xl font-semibold text-text-strong">Operation Details</h3>
                <div className="flex gap-3 items-center">
                    <div className="flex">
                        <StatusTag state={operation.state} />
                    </div>
                    <div className="flex bg-border-default w-px h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <Clock strokeWidth={1} size={18} />
                        <div className="text-text-muted text-s pt-px font-code">{duration}</div>
                    </div>
                    <div className="flex bg-border-default w-px h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <Calendar strokeWidth={1} size={18} />
                        <div className="text-text-muted text-s pt-px font-code">{createdAt}</div>
                    </div>
                </div>
            </header>

            <div className="flex gap-5 flex-wrap">
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Type</div>
                    <div className="text-text-muted text-xs pt-px">
                        <OperationTag message={operation.message} operation={operation.operation} />
                    </div>
                </div>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
                <div className="flex gap-2 items-center max-w-[30%]">
                    <div className="font-semibold text-sm">Integration</div>
                    <div className="text-text-muted text-s font-code truncate">
                        {operation.integrationName ? (
                            <Link
                                to={`/${env}/integrations/${operation.integrationName}`}
                                target="_blank"
                                className="flex gap-2.5 items-center hover:text-text-strong"
                            >
                                <ProviderTag msg={operation} />
                                <ExternalLink size={16} strokeWidth={1.5} className="shrink-0" />
                            </Link>
                        ) : (
                            'n/a'
                        )}
                    </div>
                </div>
                <div className="flex bg-border-default w-px h-[16px]">&nbsp;</div>
                <div className="flex gap-2 items-center max-w-[30%]">
                    <div className="font-semibold text-sm">Connection</div>
                    <div className="text-text-muted text-s font-code truncate">
                        {operation.connectionName ? (
                            <Link
                                to={`/${env}/connections/${operation.integrationName}/${operation.connectionName}`}
                                target="_blank"
                                className="flex gap-2.5 items-center hover:text-text-strong"
                            >
                                <div className="truncate">{operation.connectionName}</div>
                                <ExternalLink size={16} strokeWidth={1.5} className="shrink-0" />
                            </Link>
                        ) : (
                            'n/a'
                        )}
                    </div>
                </div>
                <div className="flex bg-border-default w-px h-[16px]">&nbsp;</div>
                <div className="flex gap-2 items-center max-w-[30%]">
                    <div className="font-semibold text-sm">Script</div>
                    <div className="text-text-muted text-s pt-px truncate">{operation.syncConfigName ? operation.syncConfigName : 'n/a'}</div>
                </div>
            </div>
            <div className="">
                <h4 className="font-semibold text-sm mb-2">Payload</h4>
                {payload ? (
                    <div
                        className="text-text-muted text-sm bg-surface-panel-inset py-2 resize-y overflow-y-auto overflow-x-hidden"
                        style={{
                            minHeight: '100px',
                            height: '30vh',
                            maxHeight: '60vh',
                            resize: 'vertical'
                        }}
                    >
                        <Prism
                            language="json"
                            className="transparent-code"
                            colorScheme={darkMode ? 'dark' : 'light'}
                            styles={() => {
                                return { code: { padding: '0', whiteSpace: 'pre-wrap' } };
                            }}
                        >
                            {JSON.stringify(payload, null, 2)}
                        </Prism>
                    </div>
                ) : (
                    <div className="text-text-muted text-xs bg-surface-panel-inset py-4 px-4">No payload.</div>
                )}
            </div>
            <Logs operation={operation} operationId={operationId} isLive={isLive} />
        </div>
    );
};
