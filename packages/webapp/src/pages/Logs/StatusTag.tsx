import type { SearchLogsData } from '@nangohq/types';

export const StatusTag: React.FC<{ state: SearchLogsData['state'] }> = ({ state }) => {
    if (state === 'success') {
        return (
            <div className="inline-flex px-2 py-0.5 bg-lime-400 bg-opacity-30 rounded">
                <div className="text-lime-400 uppercase text-xs">Success</div>
            </div>
        );
    } else if (state === 'running') {
        return (
            <div className="inline-flex px-2 py-0.5 bg-blue-400 bg-opacity-30 rounded">
                <div className="text-blue-400 uppercase text-xs">Running</div>
            </div>
        );
    } else if (state === 'cancelled') {
        return (
            <div className="inline-flex px-2 py-0.5 bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-xs">Cancelled</div>
            </div>
        );
    } else if (state === 'failed') {
        return (
            <div className="inline-flex px-2 py-0.5 bg-red-400 bg-opacity-30 rounded">
                <div className="text-red-400 uppercase text-xs">Failed</div>
            </div>
        );
    } else if (state === 'timeout') {
        return (
            <div className="inline-flex px-2 py-0.5 bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-xs">Timeout</div>
            </div>
        );
    } else if (state === 'waiting') {
        return (
            <div className="inline-flex px-2 py-0.5 bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-xs">Waiting</div>
            </div>
        );
    }

    return null;
};
