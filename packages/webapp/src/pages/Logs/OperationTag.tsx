import { ChevronRight } from '@geist-ui/icons';
import type { SearchLogsData } from '@nangohq/types';

export const OperationTag: React.FC<{ operation: Exclude<SearchLogsData['operation'], null> }> = ({ operation }) => {
    return (
        <div className="inline-flex px-2 py-0.5 bg-zinc-900 rounded text-gray-400 uppercase text-xs items-center gap-1">
            {operation.type}
            {'action' in operation && (
                <>
                    <ChevronRight size={15} />
                    {operation.action}
                </>
            )}
        </div>
    );

    return null;
};
