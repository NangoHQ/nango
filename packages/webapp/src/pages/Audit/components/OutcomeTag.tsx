import { Check, X } from 'lucide-react';

import { Tag } from '@/components/ui/Tag';

import type { AuditOutcome } from '@nangohq/types';

const outcomeVariant: Record<AuditOutcome, React.ComponentProps<typeof Tag>['variant']> = {
    success: 'success',
    failure: 'alert',
    denied: 'warning'
};

// `normal-case` overrides Tag's uppercase base: the outcome is a value from the event, shown as it is stored.
export const OutcomeTag: React.FC<{ outcome: AuditOutcome }> = ({ outcome }) => (
    <Tag variant={outcomeVariant[outcome]} className="gap-1 font-code normal-case">
        {outcome === 'success' ? <Check size={12} /> : <X size={12} />}
        {outcome}
    </Tag>
);
