import { useMemo } from 'react';
import Info from '../../components/ui/Info';
import { useGetOperation } from '../../hooks/useLogs';
import { useStore } from '../../store';
import { OperationTag } from './components/OperationTag';
import { StatusTag } from './components/StatusTag';
import { elapsedTime, formatDateToLogFormat } from '../../utils/utils';
import { Link } from 'react-router-dom';
import { CalendarIcon, ClockIcon, ExternalLinkIcon } from '@radix-ui/react-icons';
import { SearchInOperation } from './components/SearchInOperation';
import { Skeleton } from '../../components/ui/Skeleton';

export const ShowOperation: React.FC<{ operationId: string }> = ({ operationId }) => {
    const env = useStore((state) => state.env);
    const { operation, loading, error } = useGetOperation(env, { operationId });

    const duration = useMemo<string>(() => {
        if (!operation) {
            return '';
        }
        if (!operation.endedAt || !operation.startedAt) {
            return 'n/a';
        }

        return elapsedTime(new Date(operation.startedAt), new Date(operation.endedAt));
    }, [operation]);
    const createdAt = useMemo(() => {
        return operation?.createdAt ? formatDateToLogFormat(operation?.createdAt) : 'n/a';
    }, [operation?.createdAt]);

    if (loading) {
        return (
            <div className="py-6 px-6 flex flex-col gap-9">
                <h3 className="text-xl font-semibold text-white flex gap-4 items-center">Operation Details</h3>
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[250px]" />
                <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Payload</h4>
                    <Skeleton className="h-4 w-[250px]" />
                </div>
                <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Logs</h4>
                    <Skeleton className="h-4 w-[250px]" />
                </div>
            </div>
        );
    }

    if (error || !operation) {
        return (
            <div className="py-6 px-6 flex flex-col gap-9">
                <Info color="red" classNames="text-xs" size={20} padding="p-2">
                    An error occurred
                </Info>
            </div>
        );
    }

    return (
        <div className="py-8 px-6 flex flex-col gap-5">
            <header className="flex gap-2 flex-col border-b border-b-gray-400 pb-5">
                <h3 className="text-xl font-semibold text-white ">Operation Details</h3>
                <div className="flex gap-3 items-center">
                    <div className="flex">
                        <StatusTag state={operation.state} />
                    </div>
                    <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <ClockIcon />
                        <div className="text-gray-400 text-s pt-[1px] font-code">{duration}</div>
                    </div>
                    <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                    <div className="flex gap-2 items-center">
                        <CalendarIcon />
                        <div className="text-gray-400 text-s pt-[1px] font-code">{createdAt}</div>
                    </div>
                </div>
            </header>

            <div className="flex gap-5 flex-wrap">
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Type</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <OperationTag operation={operation.operation!} highlight />
                    </div>
                </div>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
                <div className="flex gap-2 items-center max-w-[40%]">
                    <div className="font-semibold text-sm">Integration</div>
                    <div className="text-gray-400 text-s font-code truncate">
                        {operation.configName ? (
                            <Link to={`/integration/${operation.configName}`} target="_blank" className="flex gap-1 items-center hover:text-white">
                                <div className="truncate">{operation.configName}</div>
                                <div className="w-4">
                                    <ExternalLinkIcon className="w-[14px]" />
                                </div>
                            </Link>
                        ) : (
                            'n/a'
                        )}
                    </div>
                </div>
                <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                <div className="flex gap-2 items-center max-w-[40%]">
                    <div className="font-semibold text-sm">Connection</div>
                    <div className="text-gray-400 text-s font-code truncate">
                        {operation.connectionName ? (
                            <Link
                                to={`/connections/${operation.configName}/${operation.connectionName}`}
                                target="_blank"
                                className="flex gap-1 items-center hover:text-white"
                            >
                                <div className="truncate">{operation.connectionName}</div>
                                <div className="w-4">
                                    <ExternalLinkIcon className="w-[14px]" />
                                </div>
                            </Link>
                        ) : (
                            'n/a'
                        )}
                    </div>
                </div>
                <div className="flex bg-border-gray-400 w-[1px] h-[16px]">&nbsp;</div>
                <div className="flex gap-2 items-center max-w-[40%]">
                    <div className="font-semibold text-sm">Script</div>
                    <div className="text-gray-400 text-s pt-[1px] truncate">{operation.syncName ? operation.syncName : 'n/a'}</div>
                </div>
            </div>
            <div className="">
                <h4 className="font-semibold text-sm mb-2">Payload</h4>
                {!operation.meta && <div className="text-gray-400 text-xs bg-pure-black py-4 px-4">No payload.</div>}
            </div>
            <SearchInOperation operationId={operationId} />
        </div>
    );
};
