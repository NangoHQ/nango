import type { SearchMessagesData } from '@nangohq/types';

export const LevelTag: React.FC<{ level: SearchMessagesData['level'] }> = ({ level }) => {
    if (level === 'error') {
        return (
            <div className="inline-flex px-1 pt-[1px] bg-red-400 bg-opacity-30 rounded">
                <div className="text-red-400 uppercase text-[10px]">Error</div>
            </div>
        );
    } else if (level === 'info') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-blue-400 bg-opacity-30 rounded">
                <div className="text-blue-400 uppercase text-[10px]">Info</div>
            </div>
        );
    } else if (level === 'warn') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-orange-400 bg-opacity-30 rounded">
                <div className="text-orange-400 uppercase text-[10px]">Warn</div>
            </div>
        );
    } else if (level === 'debug') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-gray-400 bg-opacity-30 rounded">
                <div className="text-gray-400 uppercase text-[10px]">Debug</div>
            </div>
        );
    }

    return null;
};
