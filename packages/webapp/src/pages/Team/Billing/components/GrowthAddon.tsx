import { Button } from '@nangohq/design-system';

import { Dot } from '@/components/ui/Dot';
import { track } from '@/utils/analytics';
import { GROWTH_ADDON_COPY } from './planCardCopy.js';

export type GrowthAddonState = 'none' | 'active' | 'pending-removal';

// Orb schedules a removal for the end of the term and nothing cancels it, so keeping the add-on is
// the one action that still goes through support.
function openChat() {
    if (window.Plain) {
        window.Plain.open();
    } else {
        window.open('https://nango.dev/slack', '_blank', 'noopener,noreferrer');
    }
}

export const GrowthAddon: React.FC<{ state: GrowthAddonState; onAdd: () => void; onRemove: () => void }> = ({ state, onAdd, onRemove }) => {
    const onActionClicked = () => {
        track('web:usage:addon_action_clicked', { state });
        if (state === 'none') {
            onAdd();
        } else if (state === 'active') {
            onRemove();
        } else {
            openChat();
        }
    };

    return (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-muted p-3">
            <div className="flex items-start justify-between gap-2">
                <span className="text-text-strong text-body-medium-medium">{GROWTH_ADDON_COPY.title}</span>
                {state === 'none' && (
                    <Button variant="primary" size="sm" onClick={onActionClicked}>
                        Add to plan
                    </Button>
                )}
                {state === 'active' && (
                    <Button variant="link-danger" size="sm" onClick={onActionClicked}>
                        Remove
                    </Button>
                )}
                {state === 'pending-removal' && (
                    <Button variant="link-neutral" size="sm" onClick={onActionClicked}>
                        Keep add-on
                    </Button>
                )}
            </div>
            <div className="flex items-center gap-1.5">
                {state !== 'none' && <Dot variant={state === 'active' ? 'success' : 'warning'} />}
                <span className="text-text-secondary text-body-medium-regular">
                    {state === 'none' && GROWTH_ADDON_COPY.price}
                    {state === 'active' && `${GROWTH_ADDON_COPY.price} · included in this period`}
                    {state === 'pending-removal' && 'Active until the end of this period'}
                </span>
            </div>
            <span className="text-text-secondary text-body-small-regular">{GROWTH_ADDON_COPY.features}</span>
        </div>
    );
};
