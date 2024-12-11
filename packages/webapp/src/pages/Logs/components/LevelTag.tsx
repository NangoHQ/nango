import type { SearchMessagesData } from '@nangohq/types';
import { Tag } from '../../../components/ui/label/Tag';

export const LevelTag: React.FC<{ level: SearchMessagesData['level'] }> = ({ level }) => {
    if (level === 'error') {
        return <Tag variant={'alert'}>Error</Tag>;
    } else if (level === 'info') {
        return <Tag variant={'info'}>Info</Tag>;
    } else if (level === 'warn') {
        return <Tag variant={'warning'}>Warn</Tag>;
    } else if (level === 'debug') {
        return <Tag variant={'gray'}>Debug</Tag>;
    }

    return null;
};
