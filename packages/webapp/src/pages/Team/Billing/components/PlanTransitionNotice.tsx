import { Info } from 'lucide-react';

import { Alert, AlertDescription } from '@nangohq/design-system';

import type { PlanTransition } from '../planTransition';

interface PlanTransitionNoticeProps {
    transition: PlanTransition;
}

export const PlanTransitionNotice: React.FC<PlanTransitionNoticeProps> = ({ transition }) => {
    return (
        <Alert variant="info">
            <Info />
            <AlertDescription>
                {transition.fromTitle} is your current plan until {transition.at}, then moves to {transition.toPlanTitle} automatically.
            </AlertDescription>
        </Alert>
    );
};
