import { ChevronLeft, X } from 'lucide-react';

import { IconButton } from '@nangohq/design-system';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useApiGetPlans } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { usePlanOverrideStore } from './planOverride';

import type { PlanDefinition } from '@nangohq/types';

const REAL_PLAN_VALUE = '__real__';
const NO_SCHEDULED_CHANGE_VALUE = '__none__';

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

    // A plan can only be "scheduled to switch to" one of its real downgrade targets, plus Free for cancellation.
    const overridePlan = overrideCode ? plansList?.data.find((p) => p.code === overrideCode) : undefined;
    const scheduledChangeCodes = new Set([...(overridePlan?.prevPlan ?? []), 'free'].filter((code) => code !== overrideCode));
    const scheduledChangeOptions = overridePlan ? plansList?.data.filter((plan) => scheduledChangeCodes.has(plan.code)) : undefined;

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
                                {plan.title}
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
            </div>
        </>
    );
};
