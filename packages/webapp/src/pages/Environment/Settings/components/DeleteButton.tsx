import { Trash2 } from 'lucide-react';

import { permissions } from '@nangohq/authz';
import { Button } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';

interface DeleteButtonProps {
    environmentName: string;
    onDelete: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disabled?: boolean | string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({ environmentName, onDelete, open, onOpenChange, disabled }) => {
    const { data } = useEnvironment(environmentName);
    const environmentAndAccount = data?.environmentAndAccount;
    const isProdEnv = environmentAndAccount?.environment.is_production;
    const { can } = usePermissions();
    const canDeleteEnvironment = !isProdEnv || can(permissions.canDeleteProdEnvironment);

    const trigger = (
        <ConditionalTooltip condition={typeof disabled === 'string'} content={disabled}>
            <PermissionGate condition={canDeleteEnvironment}>
                {(allowed) => (
                    <Button variant="danger" disabled={!!disabled || !allowed}>
                        <Trash2 strokeWidth={1} size={18} />
                        <span>Delete environment</span>
                    </Button>
                )}
            </PermissionGate>
        </ConditionalTooltip>
    );

    return (
        <DestructiveActionModal
            title="Proceed carefully!"
            description="This action is destructive & irreversible. It will delete all API credentials, connection metadata, synced records & various configurations linked to this environment."
            inputLabel={`To confirm, type your current environment's name (${environmentName}) below:`}
            confirmationKeyword={environmentName}
            confirmButtonText="Delete Environment"
            trigger={trigger}
            onConfirm={onDelete}
            open={open}
            onOpenChange={onOpenChange}
        />
    );
};
