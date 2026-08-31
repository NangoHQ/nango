import { Button } from '@nangohq/design-system';

import { Dot } from '@/components/ui/Dot';
import { track } from '@/utils/analytics';
import { openSupportChat } from '@/utils/support';
import { formatBillingDate } from '../billingPeriod.js';
import { GROWTH_ADDON_COPY } from './planCardCopy.js';

import type { GrowthAddonState } from '../planVisibility.js';

export const GrowthAddon: React.FC<{ state: GrowthAddonState; endsAt?: string }> = ({ state, endsAt }) => {
    const onContactClicked = () => {
        track('web:usage:addon_contact_clicked', { state });
        openSupportChat();
    };

    return (
        <div className="flex flex-col gap-2 rounded bg-surface-input-muted border border-dashed border-border-strong p-3">
            <div className="flex items-start justify-between gap-2">
                <span className="text-text-strong text-body-medium-medium">{GROWTH_ADDON_COPY.title}</span>
                <Button variant="link-neutral" size="sm" onClick={onContactClicked}>
                    Contact us
                </Button>
            </div>
            <div className="flex items-center gap-1.5">
                {state !== 'none' && <Dot variant={state === 'active' ? 'success' : 'warning'} />}
                <span className="text-text-secondary text-body-medium-regular">
                    {state === 'none' && GROWTH_ADDON_COPY.price}
                    {state === 'active' && `${GROWTH_ADDON_COPY.price} · included in this period`}
                    {state === 'pending-removal' && `Deactivates ${endsAt ? formatBillingDate(new Date(endsAt)) : 'at the end of this period'}`}
                </span>
            </div>
            <span className="text-text-secondary text-body-small-regular">{GROWTH_ADDON_COPY.features}</span>
        </div>
    );
};
