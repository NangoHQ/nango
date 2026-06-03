import { Tag } from '@/components-v2/ui/Tag';

import type { TagSize } from '@/components-v2/ui/Tag';
import type { SearchOperationsData } from '@nangohq/types';

export const StatusTag: React.FC<{ state: SearchOperationsData['state']; size?: TagSize }> = ({ state, size }) => {
    if (state === 'success') {
        return (
            <Tag variant={'success'} size={size}>
                Success
            </Tag>
        );
    } else if (state === 'running') {
        return (
            <Tag variant={'info'} size={size}>
                Running
            </Tag>
        );
    } else if (state === 'cancelled') {
        return (
            <Tag variant={'disabled'} size={size}>
                Cancelled
            </Tag>
        );
    } else if (state === 'failed') {
        return (
            <Tag variant={'alert'} size={size}>
                Failed
            </Tag>
        );
    } else if (state === 'timeout') {
        return (
            <Tag variant={'disabled'} size={size}>
                Timeout
            </Tag>
        );
    } else if (state === 'waiting') {
        return (
            <Tag variant={'disabled'} size={size}>
                Waiting
            </Tag>
        );
    }

    return null;
};
