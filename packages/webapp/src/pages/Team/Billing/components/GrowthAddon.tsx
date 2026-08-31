import { Button } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { Dot } from '@/components/ui/Dot';
import { track } from '@/utils/analytics';
import { formatBillingDate } from '../billingPeriod.js';
import { GROWTH_ADDON_COPY } from './planCardCopy.js';

import type { GrowthAddonState } from '../planVisibility.js';

export const GrowthAddon: React.FC<{ state: GrowthAddonState; endsAt?: string; onAdd: () => void; onRemove: () => void; lockedReason?: string }> = ({
    state,
    endsAt,
    onAdd,
    onRemove,
    lockedReason
}) => {
    const onActionClicked = () => {
        track('web:usage:addon_action_clicked', { state });
        if (state === 'none') {
            onAdd();
        } else {
            onRemove();
        }
    };

    return (
        <div className="flex flex-col gap-2 rounded bg-surface-input-muted border border-dashed border-border-strong p-3">
            <div className="flex items-start justify-between gap-2">
                <span className="text-text-strong text-body-medium-medium">{GROWTH_ADDON_COPY.title}</span>
                {state === 'none' && (
                    <ConditionalTooltip condition={!!lockedReason} content={lockedReason} side="left" asChild>
                        <Button variant="primary" size="sm" disabled={!!lockedReason} onClick={onActionClicked}>
                            Add to plan
                        </Button>
                    </ConditionalTooltip>
                )}
                {state === 'active' && (
                    <Button variant="link-danger" size="sm" onClick={onActionClicked}>
                        Remove
                    </Button>
                )}
                {/* Keeping the add-on has no action behind it until NAN-6816 lets a scheduled removal be cancelled. */}
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
