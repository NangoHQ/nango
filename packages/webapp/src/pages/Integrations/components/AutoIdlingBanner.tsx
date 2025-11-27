import { Clock, Loader2 } from 'lucide-react';
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

    return (
        <Alert variant="info">
            <Clock />
            <AlertTitle>{isTrialOver ? 'Endpoints idle' : `Auto Idling in ${daysRemaining} days`}</AlertTitle>
            <AlertDescription>Actions and syncs endpoints automatically stop every 2 weeks on the free plan.</AlertDescription>
            <AlertActions>
                <AlertButton variant={'info'} onClick={onClickExtend} disabled={trialLoading}>
                    {trialLoading && <Loader2 className="size-4 animate-spin" />}
                    {isTrialOver ? 'Restart' : 'Extend'}
                </AlertButton>
                <AlertButtonLink variant={'info'} to={`/${env}/team/billing`}>
                    Upgrade
                </AlertButtonLink>
            </AlertActions>
        </Alert>
    );
};
