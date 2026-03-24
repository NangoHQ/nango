import { IconTrash } from '@tabler/icons-react';

import { ConditionalTooltip } from '@/components-v2/ConditionalTooltip';
import { DestructiveActionModal } from '@/components-v2/DestructiveActionModal';
import { PermissionCondition } from '@/components-v2/PermissionGate';
import { Button } from '@/components-v2/ui/button';
import { useEnvironment } from '@/hooks/useEnvironment';
import { permissions, usePermissions } from '@/hooks/usePermissions';

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
            <PermissionCondition condition={canDeleteEnvironment}>
                {(allowed) => (
                    <Button variant="destructive" disabled={!!disabled || !allowed}>
                        <IconTrash stroke={1} size={18} />
                        <span>Delete environment</span>
                    </Button>
                )}
            </PermissionCondition>
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
