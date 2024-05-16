import type { SearchMessagesData } from '@nangohq/types';

export const SourceTag: React.FC<{ source: SearchMessagesData['source'] }> = ({ source }) => {
    if (source === 'internal') {
        return (
            <div className="inline-flex px-1 pt-[1px] bg-emerald-300 bg-opacity-30 rounded">
                <div className="text-emerald-300 uppercase text-[10px]">System</div>
            </div>
        );
    } else if (source === 'user') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-blue-400 bg-opacity-30 rounded">
                <div className="text-blue-400 uppercase text-[10px]">User</div>
            </div>
        );
    }

    return null;
};
