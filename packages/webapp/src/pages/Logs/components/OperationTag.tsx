import { Ban, Bot, Forward, Layers, Link, Lock, Pause, Play, Plus, RefreshCw, Settings, Settings2, Trash2, User, X } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { Tag } from '@/components/ui/Tag';

import type { SearchOperationsData } from '@nangohq/types';

// shortening agent session to prevent column overflow
const typeLabels: Partial<Record<SearchOperationsData['operation']['type'], string>> = {
    agent_session: 'session'
};

const actorIcons: Record<NonNullable<SearchOperationsData['actor']>['kind'], React.ReactNode> = {
    session: <Bot className="w-3.5 h-3.5" />,
    user: <User className="w-3.5 h-3.5" />
};

export const OperationTag: React.FC<{ message: string; operation: SearchOperationsData['operation']; actor?: SearchOperationsData['actor'] }> = ({
    message,
    operation,
    actor
}) => {
    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger>
                <div className="flex items-center gap-1">
                    <Tag>{typeLabels[operation.type] ?? operation.type}</Tag>
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

                    {operation.type === 'agent_session' && (
                        <Tag>
                            {operation.action === 'create' && <Plus className="w-3.5 h-3.5" />}
                            {operation.action === 'terminate' && <Ban className="w-3.5 h-3.5" />}
                        </Tag>
                    )}

                    {actor && operation.type !== 'agent_session' && (
                        <Tag role="img" aria-label={`Triggered by ${actor.kind}`}>
                            {actorIcons[actor.kind]}
                        </Tag>
                    )}

                    {operation.type === 'webhook' && (
                        <Tag>
                            {operation.action === 'forward' && <Forward className="w-3.5 h-3.5" />}
                            {operation.action === 'incoming' && <Settings className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_create' && <Link className="w-3.5 h-3.5" />}
                            {operation.action === 'sync' && <RefreshCw className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_refresh' && <Lock className="w-3.5 h-3.5" />}
                            {operation.action === 'connection_delete' && <Trash2 className="w-3.5 h-3.5" />}
                        </Tag>
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent align="start">
                <p>{message}</p>
            </TooltipContent>
        </Tooltip>
    );
};
