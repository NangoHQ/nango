import { IconTrash } from '@tabler/icons-react';

import { DestructiveActionModal } from '../../../components/DestructiveActionModal';
import { SimpleTooltip } from '../../../components/SimpleTooltip';
import { Button } from '../../../components/ui/button/Button';

interface DeleteButtonProps {
    environmentName: string;
    onDelete: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disabled?: boolean;
    disabledTooltip?: string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({ environmentName, onDelete, open, onOpenChange, disabled, disabledTooltip }) => {
    const tooltipContent = disabled ? disabledTooltip : '';
    const trigger = (
        <SimpleTooltip tooltipContent={tooltipContent} className="text-text-light-gray">
            <Button variant="select" className="text-alert-400 flex gap-2 items-center text-sm" disabled={disabled}>
                <IconTrash stroke={1} size={18} />
                <span>Delete environment</span>
            </Button>
        </SimpleTooltip>
    );

    return (
        <DestructiveActionModal
            title="Proceed carefully!"
            description="This action is destructive & irreversible. It will delete all API credentials, connection metadata, synced records & various configurations linked to this environment."
            inputLabel={`To confirm, type your current environment's (${environmentName}) name below:`}
            confirmationKeyword={environmentName}
            confirmButtonText="Delete Environment"
            trigger={trigger}
            onConfirm={onDelete}
            open={open}
            onOpenChange={onOpenChange}
        />
    );
};
