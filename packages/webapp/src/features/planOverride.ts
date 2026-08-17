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

interface PlanOverrideState {
    /** The plan code to visually preview instead of the account's real plan, or `null` for the real plan. */
    overrideCode: PlanDefinition['code'] | null;
    /** Plan code to simulate as a pending scheduled change (e.g. a downgrade or cancellation in progress). */
    scheduledTargetCode: PlanDefinition['code'] | null;
    /** Overdue-invoice state to simulate, or `null` to use the real Orb answer. */
    overdueOverride: OverdueOverride | null;
    setOverride: (code: PlanDefinition['code'] | null) => void;
    setScheduledTarget: (code: PlanDefinition['code'] | null) => void;
    setOverdueOverride: (override: OverdueOverride | null) => void;
}

export const usePlanOverrideStore = create<PlanOverrideState>()(
    persist(
        (set) => ({
            overrideCode: null,
            scheduledTargetCode: null,
            overdueOverride: null,
            // Reset the scheduled target too — it's only valid for the plan it was picked against.
            setOverride: (overrideCode) => set({ overrideCode, scheduledTargetCode: null }),
            setScheduledTarget: (scheduledTargetCode) => set({ scheduledTargetCode }),
            setOverdueOverride: (overdueOverride) => set({ overdueOverride })
        }),
        {
            name: LocalStorageKeys.DevPlanOverride,
            storage: createJSONStorage(() => localStorage)
        }
    )
);

/** Stands in for the real overdue-invoice response when the dev-tool override is on, for visual QA only. */
export function buildOverdueOverride(override: OverdueOverride): GetOverdueInvoices['Success'] {
    return {
        data: {
            hasOverdue: true,
            count: 1,
            // Any absolute URL exercises the CTA — the real one is account-specific and short-lived.
            portalUrl: override === 'with-portal' ? 'https://billing.withorb.com/portal/dev-tool-preview' : null
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
