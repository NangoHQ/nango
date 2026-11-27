import { Bot } from 'lucide-react';
import { useState } from 'react';
import { useInterval } from 'react-use';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { formatDateToLogFormat } from '@/utils/utils';
import { operationTypeLabel } from './components/OperationProperties';
import { OperationStatus } from './components/OperationStatus';
import { formatDuration, formatElapsed, formatOperationTime } from './format';

import type { SearchOperationsData } from '@nangohq/types';

const Muted: React.FC = () => <span className="text-text-muted">—</span>;

export const TimestampCell: React.FC<{ createdAt: string; now: Date }> = ({ createdAt, now }) => (
    <span className="truncate type-code-regular-xs text-text-secondary" title={formatDateToLogFormat(createdAt)}>
        {formatOperationTime(createdAt, now)}
    </span>
);

export const Elapsed: React.FC<{ startedAt: string }> = ({ startedAt }) => {
    const [now, setNow] = useState(() => Date.now());
    useInterval(() => setNow(Date.now()), 1000);
    return <>{formatElapsed(now - new Date(startedAt).getTime())}</>;
};

export const DurationCell: React.FC<{ operation: SearchOperationsData }> = ({ operation }) => {
    if (operation.state === 'running' && operation.startedAt) {
        return (
            <span className="truncate type-code-regular-xs text-text-muted">
                <Elapsed startedAt={operation.startedAt} />
            </span>
        );
    }
    if (!operation.startedAt || !operation.endedAt) {
        return <Muted />;
    }
    const duration = formatDuration(new Date(operation.endedAt).getTime() - new Date(operation.startedAt).getTime());
    return (
        <span className="truncate type-code-regular-xs text-text-secondary" title={duration}>
            {duration}
        </span>
    );
};

export const StatusCell: React.FC<{ operation: SearchOperationsData }> = ({ operation }) => <OperationStatus state={operation.state} />;

export const TypeCell: React.FC<{ operation: SearchOperationsData }> = ({ operation }) => {
    const { type, action } = operationTypeLabel(operation);
    return (
        <span className="truncate text-text-strong">
            {type} <span className="text-text-secondary">{action}</span>
        </span>
    );
};

const Logo: React.FC<{ operation: SearchOperationsData }> = ({ operation }) =>
    operation.providerName ? (
        <IntegrationLogo provider={operation.providerName} className="-m-0.75 size-5.5 shrink-0 border-transparent bg-transparent p-0" />
    ) : null;

export const IntegrationCell: React.FC<{ operation: SearchOperationsData }> = ({ operation }) => {
    if (!operation.integrationName) {
        return <Muted />;
    }
    return (
        <span className="flex min-w-0 items-center gap-2" title={operation.integrationName}>
            <Logo operation={operation} />
            <span className="truncate text-text-strong">{operation.integrationName}</span>
        </span>
    );
};

export const FunctionCell: React.FC<{ operation: SearchOperationsData; withLogo: boolean }> = ({ operation, withLogo }) => {
    const sessionId = operation.actor?.kind === 'session' ? operation.actor.id : null;
    return (
        <span className="flex min-w-0 items-center gap-2">
            {withLogo && <Logo operation={operation} />}
            {operation.syncConfigName ? <span className="truncate text-text-strong">{operation.syncConfigName}</span> : <Muted />}
            {sessionId && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="flex shrink-0 text-icon-secondary" role="img" aria-label={`Via agent session ${sessionId}`}>
                            <Bot className="size-3.5" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Via agent session {sessionId}</TooltipContent>
                </Tooltip>
            )}
        </span>
    );
};

export const ConnectionCell: React.FC<{ operation: SearchOperationsData }> = ({ operation }) => {
    if (!operation.connectionName) {
        return <Muted />;
    }
    return (
        <span className="truncate type-code-regular-xs text-text-default" title={operation.connectionName}>
            {operation.connectionName}
        </span>
    );
};
