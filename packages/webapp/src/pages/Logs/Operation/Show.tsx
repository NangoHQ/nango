import { Prism } from '@mantine/prism';
import { IconCalendar, IconClockHour4, IconShare2 } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInterval } from 'react-use';

import { OperationTag } from '../components/OperationTag';
import { ProviderTag } from '../components/ProviderTag';
import { Logs } from './components/Logs';
import { Info } from '../../../components/Info';
import { Skeleton } from '../../../components/ui/Skeleton';
import { CopyButton } from '../../../components/ui/button/CopyButton';
import { useGetOperation } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { formatDateToLogFormat, getRunTime } from '../../../utils/utils';
import { StatusTag } from '../components/StatusTag';

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

    if (loading) {
        return (
            <div className="py-6 px-6 flex flex-col gap-9">
                <h3 className="text-xl font-semibold text-white flex gap-4 items-center">Operation Details</h3>
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
                <Info variant={'destructive'}>An error occurred</Info>
            </div>
        );
    }

    return (
        <div className="py-8 px-6 flex flex-col gap-5 h-screen">
            <header className="flex gap-2 flex-col border-b border-b-gray-400 pb-5">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-white">Operation Details</h3>
                    <div className="mr-9">
                        <CopyButton text={window.location.href} iconType="link" />
                    </div>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="flex">
                        <StatusTag state={operation.state} />
                    </div>
                    <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <IconClockHour4 stroke={1} size={18} />
                        <div className="text-gray-400 text-s pt-[1px] font-code">{duration}</div>
                    </div>
                    <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <IconCalendar stroke={1} size={18} />
                        <div className="text-gray-400 text-s pt-[1px] font-code">{createdAt}</div>
                    </div>
                </div>
            </header>

            <div className="flex gap-5 flex-wrap">
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Type</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <OperationTag message={operation.message} operation={operation.operation} />
                    </div>
                </div>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
                <div className="flex gap-2 items-center max-w-[30%]">
                    <div className="font-semibold text-sm">Integration</div>
                    <div className="text-gray-400 text-s font-code truncate">
                        {operation.integrationName ? (
                            <Link
                                to={`/${env}/integrations/${operation.integrationName}`}
                                target="_blank"
                                className="flex gap-2.5 items-center hover:text-white"
                            >
                                <ProviderTag msg={operation} />
                                <div className="w-4">
                                    <IconShare2 stroke={1} size={18} />
                                </div>
                            </Link>
                        ) : (
                            'n/a'
                        )}
                    </div>
                </div>
                <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                <div className="flex gap-2 items-center max-w-[30%]">
                    <div className="font-semibold text-sm">Connection</div>
                    <div className="text-gray-400 text-s font-code truncate">
                        {operation.connectionName ? (
                            <Link
                                to={`/${env}/connections/${operation.integrationName}/${operation.connectionName}`}
                                target="_blank"
                                className="flex gap-2.5 items-center hover:text-white"
                            >
                                <div className="truncate">{operation.connectionName}</div>
                                <div className="w-4">
                                    <IconShare2 stroke={1} size={18} />
                                </div>
                            </Link>
                        ) : (
                            'n/a'
                        )}
                    </div>
                </div>
                <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                <div className="flex gap-2 items-center max-w-[30%]">
                    <div className="font-semibold text-sm">Script</div>
                    <div className="text-gray-400 text-s pt-[1px] truncate">{operation.syncConfigName ? operation.syncConfigName : 'n/a'}</div>
                </div>
            </div>
            <div className="">
                <h4 className="font-semibold text-sm mb-2">Payload</h4>
                {payload ? (
                    <div
                        className="text-gray-400 text-sm bg-pure-black py-2 resize-y overflow-auto"
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
                            colorScheme="dark"
                            styles={() => {
                                return { code: { padding: '0', whiteSpace: 'pre-wrap' } };
                            }}
                        >
                            {JSON.stringify(payload, null, 2)}
                        </Prism>
                    </div>
                ) : (
                    <div className="text-gray-400 text-xs bg-pure-black py-4 px-4">No payload.</div>
                )}
            </div>
            <Logs operation={operation} operationId={operationId} isLive={isLive} />
        </div>
    );
};
