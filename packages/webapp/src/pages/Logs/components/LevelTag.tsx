import type { SearchMessagesData } from '@nangohq/types';
import { Tag } from '../../../components/ui/label/Tag';

export const LevelTag: React.FC<{ level: SearchMessagesData['level'] }> = ({ level }) => {
    if (level === 'error') {
        return (
            <Tag bgClassName="bg-red-400 bg-opacity-30" textClassName="text-red-400">
                Error
            </Tag>
        );
    } else if (level === 'info') {
        return (
            <Tag bgClassName="bg-blue-400 bg-opacity-30" textClassName="text-blue-400">
                Info
            </Tag>
        );
    } else if (level === 'warn') {
        return (
            <Tag bgClassName="bg-orange-400 bg-opacity-30" textClassName="text-orange-400">
                Warn
            </Tag>
        );
    } else if (level === 'debug') {
        return (
            <Tag bgClassName="bg-gray-400 bg-opacity-30" textClassName="text-gray-400">
                Debug
            </Tag>
        );
    }

    return null;
};
