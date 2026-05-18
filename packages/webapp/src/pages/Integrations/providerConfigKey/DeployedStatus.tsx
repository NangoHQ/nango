import { AlertTriangle, Check } from 'lucide-react';

import type { DeployedMeta } from '@nangohq/types';

export const DeployedStatus: React.FC<{ deployed: DeployedMeta }> = ({ deployed }) => {
    if (deployed.source === 'catalog') {
        return (
            <span className="inline-flex items-center gap-0.5 text-feedback-success-fg text-body-small-regular">
                <Check className="size-3" />
                Deployed
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-0.5 text-feedback-warning-fg text-body-small-regular">
            <AlertTriangle className="size-3" />
            Exists
        </span>
    );
};
