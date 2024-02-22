import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import { BoltIcon } from '@heroicons/react/24/outline';
import { formatDateToShortUSFormat } from '../../../utils/utils';
import { Flow } from '../../../types';

export interface FlowProps {
    flow: Flow;
}

export default function FlowCard({ flow }: FlowProps) {
    return (
        <div className="p-3">
            <div className="flex space-x-2">
                {flow?.type === 'sync' && (
                    <ArrowPathRoundedSquareIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                )}
                {flow?.type === 'action' && (
                    <BoltIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                )}
                <div className="text-sm font-semibold">{flow?.type === 'sync' ? 'Sync' : 'Action'} Information</div>
            </div>
            <div className="flex mt-3 text-xs items-center justify-between">
                <span className="flex flex-col">
                    <div className="text-gray-400">SCRIPT NAME</div>
                    <div className="text-white">{flow?.name}</div>
                </span>
            </div>
            {('version' in flow || 'last_deployed' in flow) && (
                <div className="flex mt-3 text-xs items-center justify-between">
                    {flow?.version && (
                        <span className="flex flex-col">
                            <div className="text-gray-400">VERSION</div>
                            <div className="text-white">{flow?.version}</div>
                        </span>
                    )}
                    {flow?.last_deployed && (
                        <span className="flex flex-col">
                            <div className="text-gray-400">LAST DEPLOYED</div>
                            <div className="text-white">{formatDateToShortUSFormat(flow?.last_deployed as string)}</div>
                        </span>
                    )}
                </div>
            )}
            <div className="flex mt-3 text-xs items-center">
                <span className="flex flex-col w-1/2">
                    <div className="text-gray-400">SOURCE</div>
                    <div className="text-white">
                        {'is_public' in flow && flow.is_public ? 'Public' : 'Custom'}
                    </div>
                </span>
                {flow?.type === 'sync' && 'sync_type' in flow && (
                    <span className="flex flex-col w-1/2">
                        <div className="text-gray-400">TYPE</div>
                        <div className="text-white">{flow?.sync_type ?? '-'}</div>
                    </span>
                )}
            </div>
            {flow?.type === 'sync' && (
                <>
                    <div className="flex mt-3 text-xs items-center justify-between">
                        <span className="flex flex-col">
                            <div className="text-gray-400">FREQUENCY</div>
                            <div className="text-white">
                                {flow?.runs ?? '-'}
                            </div>
                        </span>
                        <span className="flex flex-col">
                            <div className="text-gray-400">TRACK DELETES</div>
                            <div className="text-white">{flow?.track_deletes === true ? 'Yes' : 'No'}</div>
                        </span>
                    </div>
                    <div className="flex mt-3 text-xs items-center">
                        {'input' in flow && (
                            <span className="flex flex-col w-1/2">
                                <div className="text-gray-400">METADATA</div>
                                <div className="text-white">
                                    {Object.keys(flow?.input as object).length > 0 ? 'Yes' : 'No'}
                                </div>
                            </span>
                        )}
                        <span className="flex flex-col w-1/2">
                            <div className="text-gray-400">AUTO STARTS</div>
                            <div className="text-white">{flow?.auto_start === false ? 'No' : 'Yes'}</div>
                        </span>
                    </div>
                </>
            )}
            <div className="flex mt-3 text-xs items-center">
                <span className="flex flex-col w-1/2">
                    <div className="text-gray-400">ENABLED</div>
                    <div className="text-amber-500">
                        {'version' in flow && flow.version !== null ? 'Yes' : 'No'}
                    </div>
                </span>
            </div>
        </div>
    );
}
