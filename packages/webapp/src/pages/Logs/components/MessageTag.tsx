import type { SearchMessagesData } from '@nangohq/types';

export const MessageTag: React.FC<{ type: SearchMessagesData['type'] }> = ({ type }) => {
    if (type === 'log') {
        return (
            <div className="inline-flex px-1 pt-[1px] bg-emerald-300 bg-opacity-30 rounded">
                <div className="text-emerald-300 uppercase text-[10px]">Message</div>
            </div>
        );
    } else if (type === 'http') {
        return (
            <div className="inline-flex px-2 pt-[1px] bg-blue-400 bg-opacity-30 rounded">
                <div className="text-blue-400 uppercase text-[10px]">HTTP</div>
            </div>
        );
    }

    return null;
};
