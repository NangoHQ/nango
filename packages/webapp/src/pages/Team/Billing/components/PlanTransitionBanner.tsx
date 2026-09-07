import { Clock9 } from 'lucide-react';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { openSupportChat } from '@/utils/support';

import type { PlanTransition } from '../planTransition';

interface PlanTransitionBannerProps {
    transition: PlanTransition;
}

/**
 * Deliberately silent about the new usage metrics the design shows alongside it: an account is still
 * measured on the retired metrics until Orb moves it, so there is nothing new to review yet (NAN-6744).
 */
export const PlanTransitionBanner: React.FC<PlanTransitionBannerProps> = ({ transition }) => {
    return (
        <Alert variant="info" size="wide">
            <Clock9 />
            <AlertTitle>Your plan is changing on {transition.at}</AlertTitle>
            <AlertDescription>
                Your account is scheduled to move to {transition.toPlanTitle} on {transition.at}. You&apos;ll keep access to all the features you have today.
            </AlertDescription>
            <AlertActions>
                <AlertButton onClick={openSupportChat}>Contact us</AlertButton>
            </AlertActions>
        </Alert>
    );
};
