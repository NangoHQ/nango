import { ChevronLeft, X } from 'lucide-react';
import { useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { hasMonthlySpend } from '@/pages/Team/Billing/planVisibility';
import { useStore } from '@/store';
import { usePlanOverrideStore } from './planOverride';

import type { PeriodCostsOverride, SpendOverride, UsageLimitOverride } from './planOverride';
import type { GrowthAddonState } from '@/pages/Team/Billing/components/GrowthAddon';
import type { PlanDefinition } from '@nangohq/types';

const REAL_PLAN_VALUE = '__real__';
const NO_SCHEDULED_CHANGE_VALUE = '__none__';
const REAL_OVERDUE_VALUE = '__real_state__';
const OVERDUE_VALUE = '__overdue__';
const REAL_USAGE_VALUE = '__real_usage__';
const REAL_SPEND_VALUE = '__real_spend__';
const UNAVAILABLE_SPEND_VALUE = 'unavailable';
// A base-only Starter bill, a mid-period Growth bill, and the startup deal's real zero.
const SPEND_PRESETS_IN_CENTS = [0, 5000, 128430];
const REAL_PERIOD_COSTS_VALUE = '__real_period_costs__';
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
    const usageLimitOverride = usePlanOverrideStore((s) => s.usageLimitOverride);
    const setUsageLimitOverride = usePlanOverrideStore((s) => s.setUsageLimitOverride);
    const spendHeadlineEnabled = usePlanOverrideStore((s) => s.spendHeadlineEnabled);
    const setSpendHeadlineEnabled = usePlanOverrideStore((s) => s.setSpendHeadlineEnabled);
    const spendOverride = usePlanOverrideStore((s) => s.spendOverride);
    const setSpendOverride = usePlanOverrideStore((s) => s.setSpendOverride);
    const metricChargesEnabled = usePlanOverrideStore((s) => s.metricChargesEnabled);
    const setMetricChargesEnabled = usePlanOverrideStore((s) => s.setMetricChargesEnabled);
    const periodCostsOverride = usePlanOverrideStore((s) => s.periodCostsOverride);
    const setPeriodCostsOverride = usePlanOverrideStore((s) => s.setPeriodCostsOverride);
    const addonState = usePlanOverrideStore((s) => s.addonState);
    const setAddonState = usePlanOverrideStore((s) => s.setAddonState);

    // Plan caps are enforced on Free only, so that simulator is offered there alone. Overdue invoices
    // aren't plan-specific — a downgraded account can still owe one — so that one is always offered.
    const { data: environmentData } = useCurrentPlan(env);
    const isFreePlan = environmentData?.plan?.name === 'free';
    const isPayAsYouGo = environmentData?.plan?.name === 'pay-as-you-go';
    const leadsWithSpend = hasMonthlySpend(environmentData?.plan);

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

    const prevPlanCodes = plansList?.data.find((plan) => plan.code === overrideCode)?.prevPlan;
    const scheduledChangeOptions = plansList?.data.filter((plan) => prevPlanCodes?.includes(plan.code));

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
                    <Select value={overdueOverride ? OVERDUE_VALUE : REAL_OVERDUE_VALUE} onValueChange={(value) => setOverdueOverride(value === OVERDUE_VALUE)}>
                        <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                            <SelectValue placeholder="Real state" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={REAL_OVERDUE_VALUE}>Real state (no override)</SelectItem>
                            <SelectItem value={OVERDUE_VALUE}>Overdue</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {isPayAsYouGo && (
                    <div className="flex flex-col gap-1.5 border-t border-border-muted pt-4">
                        <span className="text-sm text-text-muted">Growth add-on (no API reports one yet)</span>
                        <Select value={addonState} onValueChange={(value) => setAddonState(value as GrowthAddonState)}>
                            <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                <SelectValue placeholder="Not on the plan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Not on the plan</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="pending-removal">Removal scheduled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {leadsWithSpend && (
                    <div className="flex flex-col gap-3 border-t border-border-muted pt-4">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-sm text-text-muted">Current period spend headline (unverified — hidden from customers)</span>
                            <Select value={spendHeadlineEnabled ? 'on' : 'off'} onValueChange={(value) => setSpendHeadlineEnabled(value === 'on')}>
                                <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                    <SelectValue placeholder="Hidden" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="off">Hidden (plan name headline)</SelectItem>
                                    <SelectItem value="on">Shown</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {spendHeadlineEnabled && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-sm text-text-muted">Simulate spend (the local billing client returns none)</span>
                                <Select
                                    value={spendOverride === null ? REAL_SPEND_VALUE : String(spendOverride)}
                                    onValueChange={(value) =>
                                        setSpendOverride(
                                            value === REAL_SPEND_VALUE
                                                ? null
                                                : value === UNAVAILABLE_SPEND_VALUE
                                                  ? UNAVAILABLE_SPEND_VALUE
                                                  : (Number(value) as SpendOverride)
                                        )
                                    }
                                >
                                    <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                        <SelectValue placeholder="Real spend" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={REAL_SPEND_VALUE}>Real spend (no override)</SelectItem>
                                        {SPEND_PRESETS_IN_CENTS.map((cents) => (
                                            <SelectItem key={cents} value={String(cents)}>
                                                {(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value={UNAVAILABLE_SPEND_VALUE}>Unavailable (falls back to plan name)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="flex flex-col gap-1.5 border-t border-border-muted pt-4">
                            <span className="text-sm text-text-muted">Per-metric charges column (unverified — hidden from customers)</span>
                            <Select value={metricChargesEnabled ? 'on' : 'off'} onValueChange={(value) => setMetricChargesEnabled(value === 'on')}>
                                <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                    <SelectValue placeholder="Hidden" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="off">Hidden</SelectItem>
                                    <SelectItem value="on">Shown</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {metricChargesEnabled && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-sm text-text-muted">Simulate per-metric charges (the local billing client returns none)</span>
                                <Select
                                    value={periodCostsOverride ?? REAL_PERIOD_COSTS_VALUE}
                                    onValueChange={(value) => setPeriodCostsOverride(value === REAL_PERIOD_COSTS_VALUE ? null : (value as PeriodCostsOverride))}
                                >
                                    <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                        <SelectValue placeholder="Real charges" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={REAL_PERIOD_COSTS_VALUE}>Real charges (no override)</SelectItem>
                                        <SelectItem value="populated">A charge on some metrics</SelectItem>
                                        <SelectItem value="zero">$0.00 on every metric</SelectItem>
                                        <SelectItem value="unavailable">Unavailable (no figures)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                )}

                {isFreePlan && (
                    <div className="flex flex-col gap-1.5 border-t border-border-muted pt-4">
                        <span className="text-sm text-text-muted">Simulate plan limits (sidebar card)</span>
                        <Select
                            value={usageLimitOverride ?? REAL_USAGE_VALUE}
                            onValueChange={(value) => setUsageLimitOverride(value === REAL_USAGE_VALUE ? null : (value as UsageLimitOverride))}
                        >
                            <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                                <SelectValue placeholder="Real usage" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={REAL_USAGE_VALUE}>Real usage (no override)</SelectItem>
                                <SelectItem value="near">Nearing plan limits</SelectItem>
                                <SelectItem value="over">Plan limits reached</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </>
    );
};
