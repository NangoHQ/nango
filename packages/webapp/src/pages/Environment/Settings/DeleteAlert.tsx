import { IconTrash } from '@tabler/icons-react';

import { DestructiveActionModal } from '../../../components/DestructiveActionModal';
import { Button } from '../../../components/ui/button/Button';

interface DeleteAlertProps {
    environmentName: string;
    onDelete: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const DeleteAlert: React.FC<DeleteAlertProps> = ({ environmentName, onDelete, open, onOpenChange }) => {
    const trigger = (
        <Button variant="select" className="text-alert-400 flex gap-2 items-center text-sm">
            <IconTrash stroke={1} size={18} />
            <span>Delete environment</span>
        </Button>
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
