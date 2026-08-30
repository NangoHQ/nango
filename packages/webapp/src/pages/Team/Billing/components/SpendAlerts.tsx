import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Button, IconButton } from '@nangohq/design-system';

import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useApiGetSpendAlert, useCurrentPlan, useDeleteSpendAlert } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { SpendAlertDialog } from './SpendAlertDialog';
import { SpendAlertsSection } from './SpendAlertsSection';

export const SpendAlerts: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();

    const { data: environmentData } = useCurrentPlan(env);
    const { data, isPending, isError } = useApiGetSpendAlert(env, environmentData?.plan);
    const { mutateAsync: deleteSpendAlert } = useDeleteSpendAlert(env);

    const thresholdInCents = data?.data.thresholdInCents ?? null;
    const currency = data?.data.currency ?? null;

    const handleRemove = () => {
        void confirm({
            title: 'Remove spend alert',
            description: "You'll stop being emailed when spend crosses this amount.",
            confirmButtonText: 'Remove',
            confirmVariant: 'danger',
            onConfirm: async () => {
                try {
                    await deleteSpendAlert();
                    toast({ title: 'Spend alert removed', variant: 'success' });
                } catch {
                    toast({ title: 'Failed to remove the spend alert', variant: 'error' });
                }
            }
        });
    };

    return (
        <>
            <SpendAlertsSection
                thresholdInCents={thresholdInCents}
                currency={currency}
                isPending={isPending}
                isError={isError}
                addAction={
                    <SpendAlertDialog currency={currency}>
                        <Button variant="link-accent">
                            <Plus /> Add spend alert
                        </Button>
                    </SpendAlertDialog>
                }
                rowActions={
                    <>
                        <SpendAlertDialog thresholdInCents={thresholdInCents} currency={currency}>
                            <IconButton variant="ghost" size="xs" label="Edit spend alert">
                                <Pencil />
                            </IconButton>
                        </SpendAlertDialog>
                        <IconButton variant="ghost" size="xs" label="Remove spend alert" onClick={handleRemove}>
                            <Trash2 />
                        </IconButton>
                    </>
                }
            />
            {DialogComponent}
        </>
    );
};
