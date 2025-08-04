import {
    IconArrowForward,
    IconClockPause,
    IconClockPlay,
    IconLink,
    IconLock,
    IconPlayerPlay,
    IconPlus,
    IconRefresh,
    IconSettings,
    IconSettingsAutomation,
    IconX
} from '@tabler/icons-react';

import * as Tooltip from '../../../components/ui/Tooltip';
import { Tag } from '../../../components/ui/label/Tag';

import type { SearchOperationsData } from '@nangohq/types';

export const OperationTag: React.FC<{ message: string; operation: SearchOperationsData['operation'] }> = ({ message, operation }) => {
    return (
        <Tooltip.Tooltip delayDuration={0}>
            <Tooltip.TooltipTrigger>
                <div className="flex items-center gap-1">
                    <Tag>{operation.type}</Tag>
                    {operation.type === 'sync' && (
                        <Tag>
                            {operation.action === 'cancel' && <IconX className="w-3.5 h-3.5" />}
                            {operation.action === 'init' && <IconPlus className="w-3.5 h-3.5" />}
                            {operation.action === 'pause' && <IconClockPause className="w-3.5 h-3.5" />}
                            {operation.action === 'request_run' && <IconPlayerPlay className="w-3.5 h-3.5" />}
                            {operation.action === 'request_run_full' && <IconPlayerPlay className="w-3.5 h-3.5" />}
                            {operation.action === 'unpause' && <IconClockPlay className="w-3.5 h-3.5" />}
                            {operation.action === 'run' && <IconRefresh className="w-3.5 h-3.5" />}
                        </Tag>
                    )}

                    {operation.type === 'auth' && (
                        <Tag>
                            {operation.action === 'create_connection' && <IconPlus className="w-3.5 h-3.5" />}
                            {operation.action === 'post_connection' && <IconSettingsAutomation className="w-3.5 h-3.5" />}
                            {operation.action === 'refresh_token' && <IconRefresh className="w-3.5 h-3.5" />}
                        </Tag>
                    )}

                    {operation.type === 'webhook' && (
                        <Tag>
                            {operation.action === 'forward' && <IconArrowForward className="w-3.5 h-3.5" />}
                            {operation.action === 'incoming' && <IconSettings className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_create' && <IconLink className="w-3.5 h-3.5" />}
                            {operation.action === 'sync' && <IconRefresh className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_refresh' && <IconLock className="w-3.5 h-3.5" />}
                        </Tag>
                    )}
                </div>
            </Tooltip.TooltipTrigger>
            <Tooltip.TooltipContent align="start">
                <p>{message}</p>
            </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
    );
};
