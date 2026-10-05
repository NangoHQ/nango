import { Clock, Loader2, TriangleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiPostPlanExtendTrial, useCurrentPlan, useTrial } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';

export const AutoIdlingBanner: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data: environmentData, refetch: refetchEnv } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const { isTrial, isTrialOver, daysRemaining } = useTrial(plan);

    const { can } = usePermissions();
    const canExtendTrial = can('account:plan:update');

    const { mutateAsync: extendTrial, isPending: trialLoading } = useApiPostPlanExtendTrial(env);

    const onClickExtend = async () => {
        try {
            await extendTrial();
        } catch {
            toast({ title: 'There was an issue extending auto idling', variant: 'error' });
            return;
        }

        void refetchEnv();

        toast({ title: 'Auto idling was extended successfully!', variant: 'success' });
    };

    if (!isTrial) {
        return null;
    }

    if (isTrialOver) {
        return (
            <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>Functions paused</AlertTitle>
                <AlertDescription>Functions are paused every 2 weeks on the free plan.</AlertDescription>
                <AlertActions>
                    <PermissionGate condition={canExtendTrial}>
                        {(allowed) => (
                            <AlertButton onClick={onClickExtend} disabled={trialLoading || !allowed}>
                                {trialLoading && <Loader2 className="animate-spin" />}
                                Restart
                            </AlertButton>
                        )}
                    </PermissionGate>
                    <AlertButtonLink to={`/team/billing#plans`}>Upgrade</AlertButtonLink>
                </AlertActions>
            </Alert>
        );
    }

    return (
        <Alert variant="info">
            <Clock />
            <AlertTitle>Functions will pause in {daysRemaining} days</AlertTitle>
            <AlertDescription>Functions are paused every 2 weeks on the free plan.</AlertDescription>
            <AlertActions>
                <PermissionGate condition={canExtendTrial}>
                    {(allowed) => (
                        <AlertButton onClick={onClickExtend} disabled={trialLoading || !allowed}>
                            {trialLoading && <Loader2 className="animate-spin" />}
                            Extend
                        </AlertButton>
                    )}
                </PermissionGate>
                <AlertButtonLink to={`/team/billing#plans`}>Upgrade</AlertButtonLink>
            </AlertActions>
        </Alert>
    );
};
