import { ChevronLeft, X } from 'lucide-react';

import { IconButton } from '@nangohq/design-system';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useApiGetPlans } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { usePlanOverrideStore } from './planOverride';

import type { PlanDefinition } from '@nangohq/types';

const REAL_PLAN_VALUE = '__real__';

interface PlanOverrideContentProps {
    onBack: () => void;
    onClose: () => void;
}

/**
 * Dev-tool panel view — overrides the *displayed* current plan across the app (Plans cards,
 * legacy banner, Usage framing, plan-gated features) with any plan definition, for visual QA.
 * Purely client-side: no backend call is made, so real billing/entitlements are untouched.
 */
export const PlanOverrideContent: React.FC<PlanOverrideContentProps> = ({ onBack, onClose }) => {
    const env = useStore((s) => s.env);
    const { data: plansList } = useApiGetPlans(env);
    const overrideCode = usePlanOverrideStore((s) => s.overrideCode);
    const setOverride = usePlanOverrideStore((s) => s.setOverride);

    return (
        <>
            <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-3">
                <div className="flex items-center gap-2">
                    <IconButton variant="ghost" size="2xs" label="Back" onClick={onBack} className="text-text-muted hover:text-text-default">
                        <ChevronLeft className="size-3.5" />
                    </IconButton>
                    <span className="font-medium text-text-default">Plan Override</span>
                </div>
                <IconButton variant="ghost" size="2xs" label="Close" onClick={onClose} className="text-text-muted hover:text-text-default">
                    <X className="size-3.5" />
                </IconButton>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-xs text-text-muted">
                    Preview the app as if the account were on a different plan. This only changes what&apos;s displayed here in this browser — the
                    account&apos;s real plan and billing are untouched.
                </p>
                <Select
                    value={overrideCode ?? REAL_PLAN_VALUE}
                    onValueChange={(value) => setOverride(value === REAL_PLAN_VALUE ? null : (value as PlanDefinition['code']))}
                >
                    <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                        <SelectValue placeholder="Real plan" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={REAL_PLAN_VALUE}>Real plan (no override)</SelectItem>
                        {plansList?.data.map((plan) => (
                            <SelectItem key={plan.code} value={plan.code}>
                                {plan.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </>
    );
};
