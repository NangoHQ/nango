import { Trash2 } from 'lucide-react';

import { Button } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { usePermissions } from '@/hooks/usePermissions';
import { EnvironmentDeleteDescription } from './EnvironmentDeleteDescription';

interface DeleteButtonProps {
    environmentName: string;
    onDelete: () => Promise<unknown>;
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
            <Trash2 />
            Delete
        </Button>
    );

    const modal = (
        <DestructiveActionModal
            title={`Delete the ${environmentName} environment?`}
            description={<EnvironmentDeleteDescription env={environmentName} />}
            size="lg"
            confirmationKeyword={environmentName}
            confirmButtonText="Delete environment"
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
