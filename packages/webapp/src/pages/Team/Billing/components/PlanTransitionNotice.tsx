import { Info } from 'lucide-react';

import { Alert, AlertDescription } from '@nangohq/design-system';

import type { PlanTransition } from '../planTransition';

interface PlanTransitionNoticeProps {
    transition: PlanTransition;
}

/**
 * Names the retired plan, which has no card of its own in the grid below.
 *
 * States the change date rather than the design's day-before, so this and the banner can't read as
 * two different deadlines.
 */
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
