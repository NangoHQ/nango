import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

import type { ApiPlan, GetOverdueInvoices, PlanDefinition } from '@nangohq/types';

/**
 * Simulated overdue-invoice state. The two variants differ only by whether Orb
 * returned a portal URL, which is what decides if the "Edit payment method" CTA
 * renders — the alerts have no other variable content (the invoice count isn't shown).
 */
export type OverdueOverride = 'with-portal' | 'without-portal';

/** Simulated aggregate usage state, matching what `getAggregateUsageState` can return. */
export type UsageLimitOverride = 'near' | 'over';

interface PlanOverrideState {
    /** The plan code to visually preview instead of the account's real plan, or `null` for the real plan. */
    overrideCode: PlanDefinition['code'] | null;
    /** Plan code to simulate as a pending scheduled change (e.g. a downgrade or cancellation in progress). */
    scheduledTargetCode: PlanDefinition['code'] | null;
    /** Overdue-invoice state to simulate, or `null` to use the real Orb answer. Paid plans only. */
    overdueOverride: OverdueOverride | null;
    /** Plan-limit state to simulate, or `null` to use real usage. Free plan only. */
    usageLimitOverride: UsageLimitOverride | null;
    setOverride: (code: PlanDefinition['code'] | null) => void;
    setScheduledTarget: (code: PlanDefinition['code'] | null) => void;
    setOverdueOverride: (override: OverdueOverride | null) => void;
    setUsageLimitOverride: (override: UsageLimitOverride | null) => void;
}

export const usePlanOverrideStore = create<PlanOverrideState>()(
    persist(
        (set) => ({
            overrideCode: null,
            scheduledTargetCode: null,
            overdueOverride: null,
            usageLimitOverride: null,
            // Reset the simulated states too — each is only valid for the plan it was picked against,
            // and the two are offered on opposite sides of the paid/free split.
            setOverride: (overrideCode) => set({ overrideCode, scheduledTargetCode: null, overdueOverride: null, usageLimitOverride: null }),
            setScheduledTarget: (scheduledTargetCode) => set({ scheduledTargetCode }),
            setOverdueOverride: (overdueOverride) => set({ overdueOverride }),
            setUsageLimitOverride: (usageLimitOverride) => set({ usageLimitOverride })
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
export function buildOverdueOverride(override: OverdueOverride, realPortalUrl?: string | null): GetOverdueInvoices['Success'] {
    return {
        data: {
            hasOverdue: true,
            count: 1,
            portalUrl: override === 'with-portal' ? (realPortalUrl ?? null) : null
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
