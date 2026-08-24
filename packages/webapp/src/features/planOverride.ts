import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

import type { ApiPlan, GetBillingPeriodCosts, GetOverdueInvoices, GetUpcomingInvoice, PlanDefinition } from '@nangohq/types';

/** Simulated aggregate usage state, matching what `getAggregateUsageState` can return. */
export type UsageLimitOverride = 'near' | 'over';

export type SpendOverride = number | 'unavailable';

/** Simulated per-metric charges: a spread of amounts, all zero, or no figures at all. */
export type PeriodCostsOverride = 'populated' | 'zero' | 'unavailable';

interface PlanOverrideState {
    /** The plan code to visually preview instead of the account's real plan, or `null` for the real plan. */
    overrideCode: PlanDefinition['code'] | null;
    /** Plan code to simulate as a pending scheduled change (e.g. a downgrade or cancellation in progress). */
    scheduledTargetCode: PlanDefinition['code'] | null;
    /** Whether to simulate an overdue invoice instead of using the real Orb answer. Paid plans only. */
    overdueOverride: boolean;
    /** Plan-limit state to simulate, or `null` to use real usage. Free plan only. */
    usageLimitOverride: UsageLimitOverride | null;
    /**
     * Reveals the current-period spend headline. Off until the figure is verified against real Orb
     * invoices; delete this flag once it ships to everyone.
     */
    spendHeadlineEnabled: boolean;
    /** Spend to simulate. Only meaningful with the flag on. */
    spendOverride: SpendOverride | null;
    /**
     * Reveals the per-metric charges column. Separate from the spend headline so the two can be
     * verified against real invoices independently; delete this flag once it ships to everyone.
     */
    metricChargesEnabled: boolean;
    /** Per-metric charges to simulate. Only meaningful with the flag on. */
    periodCostsOverride: PeriodCostsOverride | null;
    setOverride: (code: PlanDefinition['code'] | null) => void;
    setScheduledTarget: (code: PlanDefinition['code'] | null) => void;
    setOverdueOverride: (override: boolean) => void;
    setUsageLimitOverride: (override: UsageLimitOverride | null) => void;
    setSpendHeadlineEnabled: (enabled: boolean) => void;
    setSpendOverride: (override: SpendOverride | null) => void;
    setMetricChargesEnabled: (enabled: boolean) => void;
    setPeriodCostsOverride: (override: PeriodCostsOverride | null) => void;
}

export const usePlanOverrideStore = create<PlanOverrideState>()(
    persist(
        (set) => ({
            overrideCode: null,
            scheduledTargetCode: null,
            overdueOverride: false,
            usageLimitOverride: null,
            spendHeadlineEnabled: false,
            spendOverride: null,
            metricChargesEnabled: false,
            periodCostsOverride: null,
            // Reset the simulated states too — each is only valid for the plan it was picked against,
            // and the two are offered on opposite sides of the paid/free split.
            // `spendHeadlineEnabled` is deliberately not reset — it's a rollout flag, not a
            // simulated state scoped to the previewed plan.
            setOverride: (overrideCode) =>
                set({
                    overrideCode,
                    scheduledTargetCode: null,
                    overdueOverride: false,
                    usageLimitOverride: null,
                    spendOverride: null,
                    periodCostsOverride: null
                }),
            setScheduledTarget: (scheduledTargetCode) => set({ scheduledTargetCode }),
            setOverdueOverride: (overdueOverride) => set({ overdueOverride }),
            setUsageLimitOverride: (usageLimitOverride) => set({ usageLimitOverride }),
            setSpendHeadlineEnabled: (spendHeadlineEnabled) => set({ spendHeadlineEnabled }),
            setSpendOverride: (spendOverride) => set({ spendOverride }),
            setMetricChargesEnabled: (metricChargesEnabled) => set({ metricChargesEnabled }),
            setPeriodCostsOverride: (periodCostsOverride) => set({ periodCostsOverride })
        }),
        {
            name: LocalStorageKeys.DevPlanOverride,
            storage: createJSONStorage(() => localStorage)
        }
    )
);

/**
 * Stands in for the real overdue-invoice response when the dev-tool override is on, for visual QA only.
 *
 * `realPortalUrl` is the account's actual Orb portal URL, which callers already hold from the usage
 * query — the endpoint itself only fetches it when something is genuinely overdue, so the override
 * has to be handed it. Passing it through means the previewed link opens the real portal.
 */
export function buildOverdueOverride(realPortalUrl?: string | null): GetOverdueInvoices['Success'] {
    return {
        data: {
            hasOverdue: true,
            portalUrl: realPortalUrl ?? null
        }
    };
}

/** Stands in for the real upcoming-invoice response when the override is on, for visual QA only. */
export function buildSpendOverride(override: SpendOverride): GetUpcomingInvoice['Success'] {
    if (override === 'unavailable') {
        return { data: { amountInCents: null, currency: null } };
    }
    return { data: { amountInCents: override, currency: 'USD' } };
}

/**
 * Stands in for the real period-costs response when the override is on, for visual QA only.
 *
 * `populated` deliberately spreads charges across some metrics and leaves others at zero, and omits
 * `records` entirely — a metric with no price is a state real accounts are in, and it renders
 * differently from a zero charge.
 */
export function buildPeriodCostsOverride(override: PeriodCostsOverride): GetBillingPeriodCosts['Success'] {
    if (override === 'unavailable') {
        return { data: { metrics: {}, unattributedInCents: null, currency: null } };
    }
    if (override === 'zero') {
        return {
            data: {
                metrics: { connections: 0, proxy: 0, function_executions: 0, function_compute_gbms: 0, function_logs: 0, webhook_forwards: 0 },
                unattributedInCents: 0,
                currency: 'USD'
            }
        };
    }
    return {
        data: {
            metrics: { connections: 11352, proxy: 1200, function_executions: 500, function_compute_gbms: 2317, function_logs: 150, webhook_forwards: 0 },
            unattributedInCents: 0,
            currency: 'USD'
        }
    };
}

/** Overlays a dev-tool plan override (and optional simulated scheduled change) onto a real plan, for visual QA only. */
export function applyPlanOverride(
    realPlan: ApiPlan | null | undefined,
    overridePlan: PlanDefinition | null | undefined,
    scheduledTarget?: PlanDefinition | null
): ApiPlan | null | undefined {
    if (!overridePlan || !realPlan) {
        return realPlan;
    }

    return {
        ...realPlan,
        // `flags` is typed against `DBPlan` (pre-serialization), so its never-set Date fields
        // (trial_start_at, etc.) don't match `ApiPlan`'s stringified dates — safe to assert since
        // plan definitions only ever set those fields to `null`, never an actual Date.
        ...(overridePlan.flags as Partial<ApiPlan>),
        name: overridePlan.code,
        orb_future_plan: scheduledTarget?.code ?? null,
        orb_future_plan_at: scheduledTarget ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
    };
}
