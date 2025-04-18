import type { SearchOperationsData } from '@nangohq/types';
import { Tag } from '../../../components/ui/label/Tag';

export const StatusTag: React.FC<{ state: SearchOperationsData['state'] }> = ({ state }) => {
    if (state === 'success') {
        return <Tag variant={'success'}>Success</Tag>;
    } else if (state === 'running') {
        return <Tag variant={'info'}>Running</Tag>;
    } else if (state === 'cancelled') {
        return <Tag variant={'gray'}>Cancelled</Tag>;
    } else if (state === 'failed') {
        return <Tag variant={'alert'}>Failed</Tag>;
    } else if (state === 'timeout') {
        return <Tag variant={'gray'}>Timeout</Tag>;
    } else if (state === 'waiting') {
        return <Tag variant={'gray'}>Waiting</Tag>;
    }

    return null;
};
