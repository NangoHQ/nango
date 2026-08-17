import { ChevronLeft, X } from 'lucide-react';
import { useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useApiGetPlans } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { usePlanOverrideStore } from './planOverride';

import type { OverdueOverride } from './planOverride';
import type { PlanDefinition } from '@nangohq/types';

const REAL_PLAN_VALUE = '__real__';
const NO_SCHEDULED_CHANGE_VALUE = '__none__';
const REAL_OVERDUE_VALUE = '__real_state__';
// Only these 3 self-serve tiers have a real downgrade/cancellation path — legacy and Enterprise
// plans never schedule a change in practice, so they're not offered as scheduled-change targets.
const MAIN_PLAN_ORDER: PlanDefinition['code'][] = ['free', 'starter-v2', 'growth-v2'];

interface PlanOverrideContentProps {
    onBack: () => void;
    onClose: () => void;
}

export const PlanOverrideContent: React.FC<PlanOverrideContentProps> = ({ onBack, onClose }) => {
    const env = useStore((s) => s.env);
    const { data: plansList } = useApiGetPlans(env);
    const overrideCode = usePlanOverrideStore((s) => s.overrideCode);
    const setOverride = usePlanOverrideStore((s) => s.setOverride);
    const scheduledTargetCode = usePlanOverrideStore((s) => s.scheduledTargetCode);
    const setScheduledTarget = usePlanOverrideStore((s) => s.setScheduledTarget);
    const overdueOverride = usePlanOverrideStore((s) => s.overdueOverride);
    const setOverdueOverride = usePlanOverrideStore((s) => s.setOverdueOverride);

    // Several plans share a title — `starter` and `starter-legacy` are both "Starter (legacy)", as are
    // `growth` and `growth-legacy` — which makes them indistinguishable in the list. Append the code to
    // whichever titles collide, so the pairs stay tellable apart without labelling every plan twice.
    const ambiguousTitles = useMemo(() => {
        const seen = new Set<string>();
        const duplicated = new Set<string>();
        for (const plan of plansList?.data ?? []) {
            if (seen.has(plan.title)) {
                duplicated.add(plan.title);
            }
            seen.add(plan.title);
        }
        return duplicated;
    }, [plansList]);

    // Valid scheduled-change targets are the main plans below the selected override in MAIN_PLAN_ORDER.
    const overrideOrderIndex = overrideCode ? MAIN_PLAN_ORDER.indexOf(overrideCode) : -1;
    const scheduledChangeCodes = overrideOrderIndex > 0 ? MAIN_PLAN_ORDER.slice(0, overrideOrderIndex) : [];
    const scheduledChangeOptions = plansList?.data.filter((plan) => scheduledChangeCodes.includes(plan.code));

    return (
        <>
            <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-3">
                <div className="flex items-center gap-2">
                    <IconButton variant="ghost" size="2xs" label="Back" onClick={onBack}>
                        <ChevronLeft className="size-3.5" />
                    </IconButton>
                    <span className="font-medium text-text-default">Plan Override</span>
                </div>
                <IconButton variant="ghost" size="2xs" label="Close" onClick={onClose}>
                    <X className="size-3.5" />
                </IconButton>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                <p className="text-sm text-text-muted">
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
                                {ambiguousTitles.has(plan.title) ? `${plan.title} · ${plan.code}` : plan.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {scheduledChangeOptions && scheduledChangeOptions.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm text-text-muted">Simulate a scheduled change (downgrade/cancellation in progress)</span>
                        <Select
                            value={scheduledTargetCode ?? NO_SCHEDULED_CHANGE_VALUE}
                            onValueChange={(value) => setScheduledTarget(value === NO_SCHEDULED_CHANGE_VALUE ? null : (value as PlanDefinition['code']))}
                        >
                            <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_SCHEDULED_CHANGE_VALUE}>None</SelectItem>
                                {scheduledChangeOptions.map((plan) => (
                                    <SelectItem key={plan.code} value={plan.code}>
                                        {plan.code === 'free' ? 'Free (cancellation)' : `${plan.title} (downgrade)`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex flex-col gap-1.5 border-t border-border-muted pt-4">
                    <span className="text-sm text-text-muted">Simulate overdue invoices (sidebar card + Billing page banner)</span>
                    <Select
                        value={overdueOverride ?? REAL_OVERDUE_VALUE}
                        onValueChange={(value) => setOverdueOverride(value === REAL_OVERDUE_VALUE ? null : (value as OverdueOverride))}
                    >
                        <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                            <SelectValue placeholder="Real state" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={REAL_OVERDUE_VALUE}>Real state (no override)</SelectItem>
                            <SelectItem value="with-portal">Overdue, with portal link</SelectItem>
                            <SelectItem value="without-portal">Overdue, no portal link</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </>
    );
};
