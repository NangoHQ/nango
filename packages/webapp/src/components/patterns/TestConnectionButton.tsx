import { Link, useNavigate } from 'react-router-dom';

import { Button, SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { useOwnTestConnections } from '@/hooks/useConnections';

interface TestConnectionButtonProps {
    env: string;
    /** New test connections go to the first one. */
    integrationIds: string[];
    canCreate: boolean;
    size: 'sm' | 'md';
}

export const TestConnectionButton: React.FC<TestConnectionButtonProps> = ({ env, integrationIds, canCreate, size }) => {
    const navigate = useNavigate();
    const { connections, isPending } = useOwnTestConnections(env, integrationIds);
    const createPath = `/${env}/connections/create?integration_id=${encodeURIComponent(integrationIds[0] ?? '')}`;

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
                    <ButtonLink to={createPath} variant="primary" size={size} disabled={!allowed}>
                        Add test connection
                    </ButtonLink>
                )}
            </PermissionGate>
        );
    }

    const openPath =
        connections.length === 1
            ? `/${env}/connections/${encodeURIComponent(first.provider_config_key)}/${encodeURIComponent(first.connection_id)}`
            : `/${env}/connections?integrations=${integrationIds.map(encodeURIComponent).join(',')}`;

    return (
        <SplitButton variant="primary" size={size}>
            <SplitButtonAction asChild>
                <Link to={openPath}>{connections.length === 1 ? 'Open test connection' : 'Open test connections'}</Link>
            </SplitButtonAction>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <SplitButtonMenuTrigger label="More test connection actions" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={!canCreate} onSelect={() => void navigate(createPath)}>
                        Add test connection
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </SplitButton>
    );
};
