import { Forward, Layers, Link, Lock, Pause, Play, Plus, RefreshCw, Settings, Settings2, Trash2, X } from 'lucide-react';

import { Tag } from '@/components/ui/Tag';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

import type { SearchOperationsData } from '@nangohq/types';

export const OperationTag: React.FC<{ message: string; operation: SearchOperationsData['operation'] }> = ({ message, operation }) => {
    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger>
                <div className="flex items-center gap-1">
                    <Tag>{operation.type}</Tag>
                    {operation.type === 'sync' && (
                        <Tag>
                            {operation.action === 'cancel' && <X className="w-3.5 h-3.5" />}
                            {operation.action === 'init' && <Plus className="w-3.5 h-3.5" />}
                            {operation.action === 'pause' && <Pause className="w-3.5 h-3.5" />}
                            {operation.action === 'request_run' && <Play className="w-3.5 h-3.5" />}
                            {operation.action === 'request_run_full' && <Play className="w-3.5 h-3.5" />}
                            {operation.action === 'unpause' && <Play className="w-3.5 h-3.5" />}
                            {operation.action === 'run' && <RefreshCw className="w-3.5 h-3.5" />}
                            {operation.action === 'create_variant' && <Layers className="w-3.5 h-3.5" />}
                            {operation.action === 'delete_variant' && <Trash2 className="w-3.5 h-3.5" />}
                        </Tag>
                    )}

                    {operation.type === 'auth' && (
                        <Tag>
                            {operation.action === 'create_connection' && <Plus className="w-3.5 h-3.5" />}
                            {operation.action === 'post_connection' && <Settings2 className="w-3.5 h-3.5" />}
                            {operation.action === 'refresh_token' && <RefreshCw className="w-3.5 h-3.5" />}
                        </Tag>
                    )}

                    {operation.type === 'webhook' && (
                        <Tag>
                            {operation.action === 'forward' && <Forward className="w-3.5 h-3.5" />}
                            {operation.action === 'incoming' && <Settings className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_create' && <Link className="w-3.5 h-3.5" />}
                            {operation.action === 'sync' && <RefreshCw className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_refresh' && <Lock className="w-3.5 h-3.5" />}
                        </Tag>
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent align="start" className="text-text-strong">
                <p>{message}</p>
            </TooltipContent>
        </Tooltip>
    );
};
