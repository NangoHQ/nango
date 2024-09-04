import type { SearchOperationsData } from '@nangohq/types';
import {
    IconX,
    IconPlayerPlay,
    IconClockPlay,
    IconClockPause,
    IconRefresh,
    IconUserPlus,
    IconCircleKey,
    IconSettingsAutomation,
    IconClockPlus
} from '@tabler/icons-react';
import { cn } from '../../../utils/utils';
import { Tag } from '../../../components/ui/label/Tag';
import * as Tooltip from '../../../components/ui/Tooltip';

export const OperationTag: React.FC<{ message: string; operation: Exclude<SearchOperationsData['operation'], null>; highlight?: boolean }> = ({
    message,
    operation,
    highlight
}) => {
    return (
        <Tooltip.Tooltip delayDuration={0}>
            <Tooltip.TooltipTrigger>
                <div className="flex items-center gap-1">
                    <Tag bgClassName={cn('bg-zinc-900', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                        {operation.type}
                    </Tag>
                    {operation.type === 'sync' && (
                        <Tag bgClassName={cn('bg-zinc-900 rounded-full', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                            {operation.action === 'cancel' && <IconX className="w-3.5 h-3.5" />}
                            {operation.action === 'init' && <IconClockPlus className="w-3.5 h-3.5" />}
                            {operation.action === 'pause' && <IconClockPause className="w-3.5 h-3.5" />}
                            {operation.action === 'request_run' && <IconPlayerPlay className="w-3.5 h-3.5" />}
                            {operation.action === 'request_run_full' && <IconPlayerPlay className="w-3.5 h-3.5" />}
                            {operation.action === 'unpause' && <IconClockPlay className="w-3.5 h-3.5" />}
                            {operation.action === 'run' && <IconRefresh className="w-3.5 h-3.5" />}
                        </Tag>
                    )}

                    {operation.type === 'auth' && (
                        <Tag bgClassName={cn('bg-zinc-900 rounded-full', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                            {operation.action === 'create_connection' && <IconUserPlus className="w-3.5 h-3.5" />}
                            {operation.action === 'post_connection' && <IconSettingsAutomation className="w-3.5 h-3.5" />}
                            {operation.action === 'refresh_token' && <IconCircleKey className="w-3.5 h-3.5" />}
                        </Tag>
                    )}
                </div>
            </Tooltip.TooltipTrigger>
            <Tooltip.TooltipContent align="start">
                <p>
                    {message}{' '}
                    <code className="text-xs">
                        ({operation.type}
                        {'action' in operation && <>:{operation.action}</>})
                    </code>
                </p>
            </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
    );
};
