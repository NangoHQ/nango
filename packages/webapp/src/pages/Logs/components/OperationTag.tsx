// import { ChevronRight } from '@geist-ui/icons';
import type { SearchOperationsData } from '@nangohq/types';
import { cn } from '../../../utils/utils';
import { Tag } from './Tag';
import { CrossCircledIcon, LoopIcon, PauseIcon, PlayIcon, ResumeIcon, UploadIcon } from '@radix-ui/react-icons';
import * as Tooltip from '../../../components/ui/Tooltip';

export const OperationTag: React.FC<{ operation: Exclude<SearchOperationsData['operation'], null>; highlight?: boolean }> = ({ operation, highlight }) => {
    if (operation.type === 'sync') {
        return (
            <div className="flex gap-2 items-center">
                <Tag bgClassName={cn('bg-zinc-900', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                    {operation.type}
                </Tag>
                <Tooltip.Tooltip>
                    <Tooltip.TooltipTrigger>
                        <Tag bgClassName={cn('bg-zinc-900 rounded-full py-0.5', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                            {operation.action === 'cancel' && <CrossCircledIcon className="w-3.5" />}
                            {operation.action === 'init' && <UploadIcon className="w-3.5" />}
                            {operation.action === 'pause' && <PauseIcon className="w-3.5" />}
                            {operation.action === 'run' && <LoopIcon className="w-3.5" />}
                            {operation.action === 'run_full' && <PlayIcon className="w-3.5" />}
                            {operation.action === 'unpause' && <ResumeIcon className="w-3.5" />}
                        </Tag>
                    </Tooltip.TooltipTrigger>
                    <Tooltip.TooltipContent>
                        <p>
                            {operation.action} {operation.type}
                        </p>
                    </Tooltip.TooltipContent>
                </Tooltip.Tooltip>
            </div>
        );
    }

    return (
        <Tag bgClassName={cn('bg-zinc-900', highlight && 'bg-neutral-700')} textClassName={cn(highlight && 'text-white')}>
            {operation.type}
        </Tag>
    );
};
