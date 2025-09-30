import type { ApiPlan, DBPlan } from '@nangohq/types';

export function planToApi(plan: DBPlan): ApiPlan {
    return {
        ...plan,
        trial_start_at: plan.trial_start_at ? plan.trial_start_at.toISOString() : null,
        trial_end_at: plan.trial_end_at ? plan.trial_end_at.toISOString() : null,
        trial_end_notified_at: plan.trial_end_notified_at ? plan.trial_end_notified_at.toISOString() : null,
        orb_future_plan_at: plan.orb_future_plan_at?.toISOString() || null,
        orb_subscribed_at: plan.orb_subscribed_at?.toISOString() || null,
        created_at: plan.created_at.toISOString(),
        updated_at: plan.updated_at.toISOString()
    };
}
