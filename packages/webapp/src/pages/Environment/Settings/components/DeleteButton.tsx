import { Trash2 } from 'lucide-react';

import { Button } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { usePermissions } from '@/hooks/usePermissions';

interface DeleteButtonProps {
    environmentName: string;
    onDelete: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disabled?: boolean | string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({ environmentName, onDelete, open, onOpenChange, disabled }) => {
    const { can } = usePermissions();
    const canDeleteEnvironment = can('environment:delete');
    const isDisabled = Boolean(disabled) || !canDeleteEnvironment;
    const disabledReason = typeof disabled === 'string' ? disabled : !canDeleteEnvironment ? 'This action is not permitted for your role.' : undefined;

    const button = (
        <Button variant="danger" disabled={isDisabled}>
            <Trash2 strokeWidth={1} size={18} />
            <span>Delete environment</span>
        </Button>
    );

    const modal = (
        <DestructiveActionModal
            title="Proceed carefully!"
            description="This action is destructive & irreversible. It will delete all API credentials, connection metadata, synced records & various configurations linked to this environment."
            inputLabel={`To confirm, type your current environment's name (${environmentName}) below:`}
            confirmationKeyword={environmentName}
            confirmButtonText="Delete Environment"
            trigger={disabledReason ? undefined : button}
            onConfirm={onDelete}
            open={open}
            onOpenChange={onOpenChange}
        />
    );

    // When disabled, keep the tooltip outside DialogTrigger — ConditionalTooltip does not
    // forwardRef, so nesting it as DialogTrigger's asChild child drops the click handler and
    // logs a React ref warning. The modal stays mounted for controlled open state.
    if (disabledReason) {
        return (
            <>
                <ConditionalTooltip condition content={disabledReason} asChild>
                    <span className="inline-flex" tabIndex={0} aria-label={disabledReason}>
                        {button}
                    </span>
                </ConditionalTooltip>
                {modal}
            </>
        );
    }

    return modal;
};
