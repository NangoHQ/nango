import type { SearchLogsData } from '@nangohq/types';

export const StatusTag: React.FC<{ state: SearchLogsData['state'] }> = ({ state }) => {
    if (state === 'success') {
        return (
            <div className="inline-flex px-1 pt-[1px] bg-state-green-900 bg-opacity-30 rounded">
                <div className="text-state-green-400 uppercase text-[10px]">Success</div>
            </div>
        );
    } else if (state === 'running') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-blue-400 bg-opacity-30 rounded">
                <div className="text-blue-400 uppercase text-[10px]">Running</div>
            </div>
        );
    } else if (state === 'cancelled') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-[10px]">Cancelled</div>
            </div>
        );
    } else if (state === 'failed') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-red-400 bg-opacity-30 rounded">
                <div className="text-red-400 uppercase text-[10px]">Failed</div>
            </div>
        );
    } else if (state === 'timeout') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-[10px]">Timeout</div>
            </div>
        );
    } else if (state === 'waiting') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-[10px]">Waiting</div>
            </div>
        );
    }

    return null;
};
