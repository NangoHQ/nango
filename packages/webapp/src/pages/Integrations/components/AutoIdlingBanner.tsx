import { Clock, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { useEnvironment } from '../../../hooks/useEnvironment';
import { apiPostPlanExtendTrial, useTrial } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { Alert, AlertActions, AlertButton, AlertButtonLink, AlertDescription, AlertTitle } from '@/components-v2/ui/alert';

export const AutoIdlingBanner: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { plan, mutate: mutateEnv } = useEnvironment(env);
    const { isTrial, isTrialOver, daysRemaining } = useTrial(plan);

    const [trialLoading, setTrialLoading] = useState(false);

    const onClickExtend = async () => {
        setTrialLoading(true);
        const res = await apiPostPlanExtendTrial(env);
        setTrialLoading(false);

        if ('error' in res.json) {
            toast({ title: 'There was an issue extending auto idling', variant: 'error' });
            return;
        }

        void mutateEnv();

        toast({ title: 'Auto idling was extended successfully!', variant: 'success' });
    };

    if (!isTrial) {
        return null;
    }

    if (isTrialOver) {
        return (
            <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>Endpoints paused</AlertTitle>
                <AlertDescription>Functions are paused every 2 weeks on the free plan.</AlertDescription>
                <AlertActions>
                    <AlertButton variant={'warning-secondary'} onClick={onClickExtend} disabled={trialLoading}>
                        {trialLoading && <Loader2 className="size-4 animate-spin" />}
                        Restart
                    </AlertButton>
                    <AlertButtonLink variant={'warning'} to={`/${env}/team/billing`}>
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
                <AlertButton variant={'info-secondary'} onClick={onClickExtend} disabled={trialLoading}>
                    {trialLoading && <Loader2 className="size-4 animate-spin" />}
                    Extend
                </AlertButton>
                <AlertButtonLink variant={'info'} to={`/${env}/team/billing`}>
                    Upgrade
                </AlertButtonLink>
            </AlertActions>
        </Alert>
    );
};
