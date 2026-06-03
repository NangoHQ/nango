import { Tag } from '@/components-v2/ui/Tag';

import type { SearchMessagesData } from '@nangohq/types';

export const LevelTag: React.FC<{ level: SearchMessagesData['level'] }> = ({ level }) => {
    if (level === 'error') {
        return <Tag variant={'alert'}>Error</Tag>;
    } else if (level === 'info') {
        return <Tag variant={'info'}>Info</Tag>;
    } else if (level === 'warn') {
        return <Tag variant={'warning'}>Warn</Tag>;
    } else if (level === 'debug') {
        return <Tag variant={'disabled'}>Debug</Tag>;
    }

    return null;
};
