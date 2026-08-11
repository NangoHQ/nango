import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

import type { ApiPlan, PlanDefinition } from '@nangohq/types';

interface PlanOverrideState {
    /** The plan code to visually preview instead of the account's real plan, or `null` for the real plan. */
    overrideCode: PlanDefinition['code'] | null;
    /** Plan code to simulate as a pending scheduled change (e.g. a downgrade or cancellation in progress). */
    scheduledTargetCode: PlanDefinition['code'] | null;
    setOverride: (code: PlanDefinition['code'] | null) => void;
    setScheduledTarget: (code: PlanDefinition['code'] | null) => void;
}

export const usePlanOverrideStore = create<PlanOverrideState>()(
    persist(
        (set) => ({
            overrideCode: null,
            scheduledTargetCode: null,
            // Reset the scheduled target too — it's only valid for the plan it was picked against.
            setOverride: (overrideCode) => set({ overrideCode, scheduledTargetCode: null }),
            setScheduledTarget: (scheduledTargetCode) => set({ scheduledTargetCode })
        }),
        {
            name: LocalStorageKeys.DevPlanOverride,
            storage: createJSONStorage(() => localStorage)
        }
    )
);

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
