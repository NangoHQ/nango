import { IconTrash } from '@tabler/icons-react';

import { DestructiveActionModal } from '@/components-v2/DestructiveActionModal';
import { Button } from '@/components-v2/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';

interface DeleteButtonProps {
    environmentName: string;
    onDelete: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disabled?: boolean | string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({ environmentName, onDelete, open, onOpenChange, disabled }) => {
    const trigger = (
        <Tooltip>
            <TooltipTrigger>
                <Button variant="destructive" disabled={!!disabled}>
                    <IconTrash stroke={1} size={18} />
                    <span>Delete environment</span>
                </Button>
            </TooltipTrigger>
            {typeof disabled === 'string' && <TooltipContent>{disabled}</TooltipContent>}
        </Tooltip>
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
