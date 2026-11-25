import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Button, SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Dot } from '@/components/ui/Dot';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { useOwnTestConnections } from '@/hooks/useConnections';
import { track } from '@/utils/analytics';
import { formatRelativeTime } from '@/utils/dates';

import type { AnalyticsEventProperties, ApiConnectionSimple } from '@nangohq/types';

type TestConnectionEvent = AnalyticsEventProperties<'connections:test_connection_button_click'>;

interface TestConnectionButtonProps {
    env: string;
    provider: string;
    integrationId: string;
    canCreate: boolean;
    size: 'sm' | 'md';
}

export const TestConnectionButton: React.FC<TestConnectionButtonProps> = ({ env, provider, integrationId, canCreate, size }) => {
    const navigate = useNavigate();
    const { connections, isPending } = useOwnTestConnections(env, [integrationId]);
    const createPath = `/${env}/connections/create?integration_id=${encodeURIComponent(integrationId)}`;
    const connectionPath = (connection: ApiConnectionSimple) =>
        `/${env}/connections/${encodeURIComponent(connection.provider_config_key)}/${encodeURIComponent(connection.connection_id)}`;
    const trackClick = (action: TestConnectionEvent['action']) => {
        track('connections:test_connection_button_click', { provider, action, own_connection_count: connections.length });
    };

    if (isPending) {
        return (
            <Button variant="primary" size={size} loading disabled>
                Add test connection
            </Button>
        );
    }

    const [latest] = connections;
    if (!latest) {
        return (
            <PermissionGate asChild condition={canCreate}>
                {(allowed) => (
                    <ButtonLink to={createPath} onClick={() => trackClick('add')} variant="primary" size={size} disabled={!allowed}>
                        Add test connection
                    </ButtonLink>
                )}
            </PermissionGate>
        );
    }

    return (
        <>
            <PermissionGate asChild condition={canCreate}>
                {(allowed) => (
                    <ButtonLink to={createPath} onClick={() => trackClick('add')} variant="ghost" size={size} disabled={!allowed}>
                        <Plus /> Add test connection
                    </ButtonLink>
                )}
            </PermissionGate>
            {connections.length === 1 ? (
                <ButtonLink to={connectionPath(latest)} onClick={() => trackClick('open_one')} variant="primary" size={size}>
                    Open test connection
                </ButtonLink>
            ) : (
                <SplitButton variant="primary" size={size}>
                    <SplitButtonAction asChild>
                        <Link to={connectionPath(latest)} onClick={() => trackClick('open_one')}>
                            Open test connection
                        </Link>
                    </SplitButtonAction>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SplitButtonMenuTrigger label="Your other test connections" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-80 p-1.5">
                            <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 type-label-xs uppercase tracking-wide text-text-tertiary">
                                Your test connections
                            </DropdownMenuLabel>
                            {connections.map((connection) => (
                                <DropdownMenuItem
                                    key={connection.id}
                                    className="px-2.5 py-2 type-text-regular-sm"
                                    onSelect={() => {
                                        trackClick('open_from_menu');
                                        void navigate(connectionPath(connection));
                                    }}
                                >
                                    <ConnectionRow connection={connection} />
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SplitButton>
            )}
        </>
    );
};

const ConnectionRow: React.FC<{ connection: ApiConnectionSimple }> = ({ connection }) => {
    const hasAuthError = connection.errors.some((error) => error.type === 'auth');
    return (
        <div className="flex w-full items-center gap-6">
            <span className="flex-1 truncate type-code-regular-sm text-text-strong">{connection.connection_id}</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-text-secondary">
                <Dot variant={hasAuthError ? 'warning' : 'success'} />
                {hasAuthError ? 'Expired' : 'Connected'}
            </span>
            <span className="w-14 whitespace-nowrap text-right text-text-tertiary">{formatRelativeTime(connection.created_at)}</span>
        </div>
    );
};
