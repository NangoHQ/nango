import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

import type { ApiPlan, PlanDefinition } from '@nangohq/types';

interface PlanOverrideState {
    /** The plan code to visually preview instead of the account's real plan, or `null` for the real plan. */
    overrideCode: PlanDefinition['code'] | null;
    setOverride: (code: PlanDefinition['code'] | null) => void;
}

export const usePlanOverrideStore = create<PlanOverrideState>()(
    persist(
        (set) => ({
            overrideCode: null,
            setOverride: (overrideCode) => set({ overrideCode })
        }),
        {
            name: LocalStorageKeys.DevPlanOverride,
            storage: createJSONStorage(() => localStorage)
        }
    )
);

/**
 * Overlays a dev-tool plan override onto the account's real plan, purely for visual review — the
 * synthetic plan is never sent to the backend. Keeps identity/billing fields (id, dates, Orb/Stripe
 * ids) from the real plan and only swaps `name` + the plan's flags, and clears any scheduled-change
 * state so the override doesn't show a fake pending downgrade.
 */
export function applyPlanOverride(realPlan: ApiPlan | null | undefined, overridePlan: PlanDefinition | null | undefined): ApiPlan | null | undefined {
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
        orb_future_plan: null,
        orb_future_plan_at: null
    };
}
