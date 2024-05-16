// import { ChevronRight } from '@geist-ui/icons';
import type { SearchOperationsData } from '@nangohq/types';
import { cn } from '../../../utils/utils';

export const OperationTag: React.FC<{ operation: Exclude<SearchOperationsData['operation'], null>; highlight?: boolean }> = ({ operation, highlight }) => {
    return (
        <div
            className={cn(
                'inline-flex px-1 pt-[1px] bg-zinc-900 rounded text-gray-400 uppercase text-[11px] items-center gap-0.5',
                highlight && 'bg-neutral-700 text-white'
            )}
        >
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
