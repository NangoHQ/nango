import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

import type { ApiPlan, GetOverdueInvoices, GetUpcomingInvoice, PlanDefinition } from '@nangohq/types';

/** Simulated aggregate usage state, matching what `getAggregateUsageState` can return. */
export type UsageLimitOverride = 'near' | 'over';

/** Simulated current-period spend: an amount in cents, or a failed read. */
export type SpendOverride = number | 'unavailable';

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
     * Reveals the current-period spend headline on the summary strip. Off until the figure is
     * verified against real Orb invoices — until then customers keep the plan-name headline and we
     * never call the endpoint for them. Delete this flag once the headline ships to everyone.
     */
    spendHeadlineEnabled: boolean;
    /** Spend to simulate, or `null` for the real Orb answer. Only meaningful with the flag on. */
    spendOverride: SpendOverride | null;
    setOverride: (code: PlanDefinition['code'] | null) => void;
    setScheduledTarget: (code: PlanDefinition['code'] | null) => void;
    setOverdueOverride: (override: boolean) => void;
    setUsageLimitOverride: (override: UsageLimitOverride | null) => void;
    setSpendHeadlineEnabled: (enabled: boolean) => void;
    setSpendOverride: (override: SpendOverride | null) => void;
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
            // Reset the simulated states too — each is only valid for the plan it was picked against,
            // and the two are offered on opposite sides of the paid/free split.
            // `spendHeadlineEnabled` is deliberately not reset: it's a rollout flag, not a
            // simulated state, so it shouldn't switch itself off every time you preview a plan.
            setOverride: (overrideCode) =>
                set({ overrideCode, scheduledTargetCode: null, overdueOverride: false, usageLimitOverride: null, spendOverride: null }),
            setScheduledTarget: (scheduledTargetCode) => set({ scheduledTargetCode }),
            setOverdueOverride: (overdueOverride) => set({ overdueOverride }),
            setUsageLimitOverride: (usageLimitOverride) => set({ usageLimitOverride }),
            setSpendHeadlineEnabled: (spendHeadlineEnabled) => set({ spendHeadlineEnabled }),
            setSpendOverride: (spendOverride) => set({ spendOverride })
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

/**
 * Stands in for the real upcoming-invoice response when the dev-tool override is on, for visual QA
 * only. `'unavailable'` produces the null amount the strip renders as a fallback to the plan name,
 * which is also what a failed Orb read looks like from here.
 */
export function buildSpendOverride(override: SpendOverride): GetUpcomingInvoice['Success'] {
    if (override === 'unavailable') {
        return { data: { amountInCents: null, currency: null } };
    }
    return { data: { amountInCents: override, currency: 'USD' } };
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
