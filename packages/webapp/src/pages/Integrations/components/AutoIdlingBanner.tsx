import { Clock, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { permissions } from '@nangohq/authz';

import { useEnvironment } from '../../../hooks/useEnvironment';
import { apiPostPlanExtendTrial, useTrial } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { Alert, AlertActions, AlertButton, AlertButtonLink, AlertDescription, AlertTitle } from '@/components-v2/ui/alert';
import { usePermissions } from '@/hooks/usePermissions';

export const AutoIdlingBanner: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data: environmentData, refetch: refetchEnv } = useEnvironment(env);
    const plan = environmentData?.plan;
    const { isTrial, isTrialOver, daysRemaining } = useTrial(plan);

    const { can } = usePermissions();
    const canExtendTrial = can(permissions.canChangePlan);

    const [trialLoading, setTrialLoading] = useState(false);

    const onClickExtend = async () => {
        setTrialLoading(true);
        const res = await apiPostPlanExtendTrial(env);
        setTrialLoading(false);

        if ('error' in res.json) {
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
                            <AlertButton variant={'warning-secondary'} onClick={onClickExtend} disabled={trialLoading || !allowed}>
                                {trialLoading && <Loader2 className="animate-spin" />}
                                Restart
                            </AlertButton>
                        )}
                    </PermissionGate>
                    <AlertButtonLink variant={'warning'} to={`/${env}/team/billing#plans`}>
                        Upgrade
                    </AlertButtonLink>
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
                        <AlertButton variant={'info-secondary'} onClick={onClickExtend} disabled={trialLoading || !allowed}>
                            {trialLoading && <Loader2 className="animate-spin" />}
                            Extend
                        </AlertButton>
                    )}
                </PermissionGate>
                <AlertButtonLink variant={'info'} to={`/${env}/team/billing#plans`}>
                    Upgrade
                </AlertButtonLink>
            </AlertActions>
        </Alert>
    );
};
