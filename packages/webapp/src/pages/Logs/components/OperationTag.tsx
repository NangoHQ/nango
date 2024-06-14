// import { ChevronRight } from '@geist-ui/icons';
import type { SearchOperationsData } from '@nangohq/types';
import { cn } from '../../../utils/utils';
import { Tag } from '../../../components/ui/label/Tag';
import {
    CrossCircledIcon,
    Crosshair1Icon,
    MixerHorizontalIcon,
    PauseIcon,
    PersonIcon,
    PlayIcon,
    ReloadIcon,
    ResumeIcon,
    UploadIcon
} from '@radix-ui/react-icons';
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
                        <Tag bgClassName={cn('bg-zinc-900 rounded-full py-0.5', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                            {operation.action === 'cancel' && <CrossCircledIcon className="w-3.5" />}
                            {operation.action === 'init' && <UploadIcon className="w-3.5" />}
                            {operation.action === 'pause' && <PauseIcon className="w-3.5" />}
                            {operation.action === 'request_run' && <Crosshair1Icon className="w-3.5" />}
                            {operation.action === 'request_run_full' && <Crosshair1Icon className="w-3.5" />}
                            {operation.action === 'unpause' && <ResumeIcon className="w-3.5" />}
                            {operation.action === 'run' && <PlayIcon className="w-3.5" />}
                        </Tag>
                    )}

                    {operation.type === 'auth' && (
                        <Tag bgClassName={cn('bg-zinc-900 rounded-full py-0.5', highlight && 'bg-pure-black')} textClassName={cn(highlight && 'text-white')}>
                            {operation.action === 'create_connection' && <PersonIcon className="w-3.5" />}
                            {operation.action === 'post_connection' && <MixerHorizontalIcon className="w-3.5" />}
                            {operation.action === 'refresh_token' && <ReloadIcon className="w-3.5" />}
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
