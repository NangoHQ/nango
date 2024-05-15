import { useMemo } from 'react';
import Info from '../../components/ui/Info';
import Spinner from '../../components/ui/Spinner';
import { useGetOperation } from '../../hooks/useLogs';
import { useStore } from '../../store';
import { OperationTag } from './components/OperationTag';
import { StatusTag } from './components/StatusTag';
import { elapsedTime } from '../../utils/utils';
import { Link } from 'react-router-dom';
import { ExternalLinkIcon } from '@radix-ui/react-icons';
import { SearchInOperation } from './components/SearchInOperation';

export const Show: React.FC<{ operationId: string }> = ({ operationId }) => {
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

    if (loading) {
        return <Spinner />;
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
        <div className="py-6 px-6 flex flex-col gap-9">
            <h3 className="text-xl font-semibold text-white flex gap-4 items-center">Operation Details</h3>
            <div className="flex gap-6 flex-wrap">
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Timestamp</div>
                    <div className="text-gray-400 text-xs pt-[1px]">{operation.startedAt}</div>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Integration</div>
                    <div className="text-gray-400 text-xs pt-[1px] truncate">
                        <Link to={`/integration/${operation.configName}`} target="_blank" className="flex gap-1 hover:text-white">
                            <div className="truncate">{operation.configName}</div>
                            <div className="w-8">
                                <ExternalLinkIcon className="w-[14px]" />
                            </div>
                        </Link>
                    </div>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Connection</div>
                    <div className="text-gray-400 text-xs pt-[1px] truncate">
                        <Link to={`/integration/${operation.configName}`} target="_blank" className="flex gap-1 hover:text-white">
                            <div className="truncate">{operation.connectionName}</div>
                            <div className="w-8">
                                <ExternalLinkIcon className="w-[14px]" />
                            </div>
                        </Link>
                    </div>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Duration</div>
                    <div className="text-gray-400 text-xs pt-[1px]">{duration}</div>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Type</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <OperationTag operation={operation.operation!} highlight />
                    </div>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Script</div>
                    <div className="text-gray-400 text-xs pt-[1px] truncate">{operation.syncName}</div>
                </div>
                <div className="flex gap-2 items-center w-[30%]">
                    <div className="font-semibold text-sm">Status</div>
                    <div className="text-gray-400 text-xs pt-[1px]">
                        <StatusTag state={operation.state} />
                    </div>
                </div>
            </div>
            <div className="mt-4">
                <h4 className="font-semibold text-sm mb-2">Payload</h4>
                {!operation.meta && <div className="text-gray-400 text-xs">No payload...</div>}
            </div>
            <SearchInOperation operationId={operationId} />
        </div>
    );
};
