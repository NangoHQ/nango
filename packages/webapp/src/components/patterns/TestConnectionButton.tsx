import { Link, useNavigate } from 'react-router-dom';

import { Button, SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { useOwnTestConnections } from '@/hooks/useConnections';
import { track } from '@/utils/analytics';

import type { AnalyticsEventProperties } from '@nangohq/types';

type TestConnectionEvent = AnalyticsEventProperties<'connections:test_connection_button_click'>;

interface TestConnectionButtonProps {
    env: string;
    provider: string;
    page: TestConnectionEvent['page'];
    /** New test connections go to the first one. */
    integrationIds: string[];
    canCreate: boolean;
    size: 'sm' | 'md';
}

export const TestConnectionButton: React.FC<TestConnectionButtonProps> = ({ env, provider, page, integrationIds, canCreate, size }) => {
    const navigate = useNavigate();
    const { connections, isPending } = useOwnTestConnections(env, integrationIds);
    const createPath = `/${env}/connections/create?integration_id=${encodeURIComponent(integrationIds[0] ?? '')}`;
    const trackClick = (action: TestConnectionEvent['action']) => {
        track('connections:test_connection_button_click', { provider, page, action, own_connection_count: connections.length });
    };

    if (isPending) {
        return (
            <Button variant="primary" size={size} loading disabled>
                Add test connection
            </Button>
        );
    }

    const [first] = connections;
    if (!first) {
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

    const openPath =
        connections.length === 1
            ? `/${env}/connections/${encodeURIComponent(first.provider_config_key)}/${encodeURIComponent(first.connection_id)}`
            : `/${env}/connections?integrations=${integrationIds.map(encodeURIComponent).join(',')}&mine=true`;

    return (
        <SplitButton variant="primary" size={size}>
            <SplitButtonAction asChild>
                <Link to={openPath} onClick={() => trackClick(connections.length === 1 ? 'open_one' : 'open_list')}>
                    {connections.length === 1 ? 'Open test connection' : 'Open test connections'}
                </Link>
            </SplitButtonAction>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <SplitButtonMenuTrigger label="More test connection actions" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        disabled={!canCreate}
                        onSelect={() => {
                            trackClick('add');
                            void navigate(createPath);
                        }}
                    >
                        Add test connection
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </SplitButton>
    );
};
