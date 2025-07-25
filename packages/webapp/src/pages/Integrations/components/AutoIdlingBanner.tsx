import { IconBolt, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';

import { ErrorCircle } from '../../../components/ErrorCircle';
import { Button, ButtonLink } from '../../../components/ui/button/Button';
import { Tag } from '../../../components/ui/label/Tag';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { apiPostPlanExtendTrial, useTrial } from '../../../hooks/usePlan';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';

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
        <div className="mb-7 rounded-md bg-grayscale-900 border border-grayscale-600 p-4 flex gap-2 justify-between items-center">
            <div className="flex gap-2 items-center">
                <div className="flex gap-3 items-center">
                    <ErrorCircle icon="clock" variant="warning" />
                    <Tag variant={'warning'}>{isTrialOver ? 'Trial expired' : 'Auto Idling'}</Tag>
                    {!isTrialOver && <span className="text-white font-semibold">{daysRemaining} days left</span>}
                </div>
                <div className="text-grayscale-400 text-s">Actions and syncs endpoints automatically stop every 2 weeks on the free plan.</div>
            </div>
            <div className="flex gap-2">
                <Button size={'sm'} variant={'tertiary'} onClick={onClickExtend} isLoading={trialLoading}>
                    <IconRefresh stroke={1} size={18} />
                    {isTrialOver ? 'Restart' : 'Extend'}
                </Button>
                <ButtonLink to={`/${env}/team/billing`} size={'sm'} variant={'secondary'}>
                    <IconBolt stroke={1} size={18} />
                    Upgrade
                </ButtonLink>
            </div>
        </div>
    );
};
