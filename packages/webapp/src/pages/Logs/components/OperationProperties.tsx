import { Bot, ChevronRight, ListFilter } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CopyButton } from '@nangohq/design-system';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { TooltipIconButton } from '@/components/patterns/TooltipIconButton';
import { track } from '@/utils/analytics';
import { cn } from '@/utils/utils';
import { typesList } from '../constants';
import { useLogsFilters } from '../filters';
import { operationTypeLabel } from '../format';

import type { LogsType } from '../constants';
import type { AnalyticsEventProperties, OperationRow } from '@nangohq/types';

type LogsFilter = AnalyticsEventProperties<'logs:filter_update'>['filter'];

function typeFilterValue({ type, action }: OperationRow['operation']): LogsType | null {
    if (type === 'action') {
        return 'tool';
    }
    return typesList.find((value) => value === `${type}:${action}`) ?? typesList.find((value) => value === type) ?? null;
}

// Touch screens can't hover, so the actions stay visible there.
const ROW_ACTION =
    'relative z-10 flex shrink-0 transition-opacity duration-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-has-[:focus-visible]/row:opacity-100';

interface PropertyProps {
    label: string;
    children: React.ReactNode;
    to?: string;
    copy?: { value: string; label: string };
    filter?: { label: string; kind: LogsFilter; onClick: () => void };
}

// Don't wrap the row in the link: its buttons would sit inside an anchor. The link's ::after covers the row instead.
const Property: React.FC<PropertyProps> = ({ label, children, to, copy, filter }) => (
    <>
        <dt className="type-text-regular-sm text-text-secondary">{label}</dt>
        <dd
            className={cn(
                'group/row relative -mx-2 flex min-h-7 min-w-0 items-center gap-2 rounded-ds-xs px-2 type-text-regular-sm text-text-default',
                to && 'has-[a:hover]:bg-surface-panel-muted has-[a:focus-visible]:bg-surface-panel-muted'
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
            <div className="flex shrink-0 items-center gap-0.5">
                {filter && (
                    <div className={ROW_ACTION}>
                        <TooltipIconButton
                            variant="ghost"
                            size="xs"
                            label={filter.label}
                            tooltip={`Filter by this ${label.toLowerCase()}`}
                            onClick={() => {
                                track('logs:filter_update', { filter: filter.kind });
                                filter.onClick();
                            }}
                        >
                            <ListFilter />
                        </TooltipIconButton>
                    </div>
                )}
                {copy && (
                    <div className={ROW_ACTION}>
                        <CopyButton value={copy.value} size="xs" label={copy.label} tooltip="Copy" />
                    </div>
                )}
                {to ? (
                    <Link
                        to={to}
                        aria-label={`Open ${label.toLowerCase()}`}
                        className="flex size-6 shrink-0 items-center justify-center text-text-muted pointer-fine:opacity-0 outline-none after:absolute after:inset-0 after:rounded-ds-xs focus-visible:after:shadow-focus-outline-default pointer-fine:group-hover/row:opacity-100 pointer-fine:focus-visible:opacity-100"
                    >
                        <ChevronRight className="size-3.5" />
                    </Link>
                ) : (
                    <span aria-hidden className="size-6 shrink-0" />
                )}
            </div>
        </dd>
    </>
);

const Code: React.FC<{ children: string }> = ({ children }) => <span className="truncate type-code-regular-sm text-text-strong">{children}</span>;

export const OperationProperties: React.FC<{ env: string; operation: OperationRow }> = ({ env, operation }) => {
    const { setTypes, setIntegrations, setConnections, setSyncs, setAgentSessions } = useLogsFilters();
    const { type, action } = operationTypeLabel(operation);
    const { integrationName, connectionName, syncConfigName, providerName } = operation;
    const sessionId = operation.actor?.kind === 'session' ? operation.actor.id : null;
    const typeFilter = typeFilterValue(operation.operation);

    return (
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-y-0.5">
            <Property
                label="Type"
                filter={typeFilter ? { label: 'Show only operations of this type', kind: 'type', onClick: () => void setTypes([typeFilter]) } : undefined}
            >
                <span className="text-text-strong">{type}</span>
                <span className="text-text-secondary">{action}</span>
            </Property>
            {integrationName && (
                <Property
                    label="Integration"
                    to={`/${env}/integrations/${encodeURIComponent(integrationName)}`}
                    copy={{ value: integrationName, label: 'Copy integration key' }}
                    filter={{ label: "Show only this integration's operations", kind: 'integration', onClick: () => void setIntegrations([integrationName]) }}
                >
                    {providerName && <IntegrationLogo provider={providerName} className="size-4 shrink-0 p-0 bg-transparent border-transparent" />}
                    <Code>{integrationName}</Code>
                </Property>
            )}
            {integrationName && connectionName && (
                <Property
                    label="Connection"
                    to={`/${env}/connections/${encodeURIComponent(integrationName)}/${encodeURIComponent(connectionName)}`}
                    copy={{ value: connectionName, label: 'Copy connection ID' }}
                    filter={{ label: "Show only this connection's operations", kind: 'connection', onClick: () => void setConnections([connectionName]) }}
                >
                    <Code>{connectionName}</Code>
                </Property>
            )}
            {syncConfigName && (
                <Property
                    label="Function"
                    copy={{ value: syncConfigName, label: 'Copy function name' }}
                    filter={{ label: "Show only this function's operations", kind: 'script', onClick: () => void setSyncs([syncConfigName]) }}
                >
                    <Code>{syncConfigName}</Code>
                </Property>
            )}
            {sessionId && (
                <Property
                    label="Agent session"
                    copy={{ value: sessionId, label: 'Copy agent session ID' }}
                    filter={{ label: "Show only this session's operations", kind: 'agent_session', onClick: () => void setAgentSessions([sessionId]) }}
                >
                    <Bot className="size-4 shrink-0 text-text-muted" />
                    <Code>{sessionId}</Code>
                </Property>
            )}
            <Property label="Operation ID" copy={{ value: operation.id, label: 'Copy operation ID' }}>
                <Code>{operation.id}</Code>
            </Property>
        </dl>
    );
};
