import type { SearchOperationsData } from '@nangohq/types';
import { Tag } from './Tag';

export const StatusTag: React.FC<{ state: SearchOperationsData['state'] }> = ({ state }) => {
    if (state === 'success') {
        return (
            <Tag bgClassName="bg-green-base bg-opacity-30" textClassName="text-green-base">
                Success
            </Tag>
        );
    } else if (state === 'running') {
        return (
            <Tag bgClassName="bg-blue-400 bg-opacity-30" textClassName="text-blue-400">
                Running
            </Tag>
        );
    } else if (state === 'cancelled') {
        return (
            <Tag bgClassName="bg-gray-400 bg-opacity-30" textClassName="text-gray-400">
                Cancelled
            </Tag>
        );
    } else if (state === 'failed') {
        return (
            <Tag bgClassName="bg-red-400 bg-opacity-30" textClassName="text-red-400">
                Failed
            </Tag>
        );
    } else if (state === 'timeout') {
        return (
            <Tag bgClassName="bg-gray-400 bg-opacity-30" textClassName="text-gray-400">
                Timeout
            </Tag>
        );
    } else if (state === 'waiting') {
        return (
            <Tag bgClassName="bg-gray-400 bg-opacity-30" textClassName="text-gray-400">
                Waiting
            </Tag>
        );
    }

    return null;
};
