// import { ChevronRight } from '@geist-ui/icons';
import type { SearchLogsData } from '@nangohq/types';

export const OperationTag: React.FC<{ operation: Exclude<SearchLogsData['operation'], null> }> = ({ operation }) => {
    return (
        <div className="inline-flex px-1 pt-[1px] bg-zinc-900 rounded text-gray-400 uppercase text-[10px] items-center gap-0.5">
            {operation.type}
            {/* {'action' in operation && (
                <>
                    <ChevronRight size={12} />
                    {operation.action}
                </>
            )} */}
        </div>
    );

    return null;
};
