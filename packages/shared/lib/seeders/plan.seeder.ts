import type { DBPlan } from '@nangohq/types';

export function getTestPlan(override?: Partial<DBPlan>): DBPlan {
    return {
        id: 1,
        account_id: 1,
        name: 'free',
        stripe_customer_id: null,
        stripe_payment_id: null,
        orb_customer_id: null,
        orb_subscription_id: null,
        orb_future_plan: null,
        orb_future_plan_at: null,
        trial_start_at: new Date(),
        trial_end_at: new Date(),
        trial_extension_count: 0,
        trial_end_notified_at: null,
        trial_expired: null,
        environments_max: 2,
        sync_frequency_secs_min: 60,
        connections_max: 1000,
        monthly_actions_max: 1000,
        monthly_active_records_max: 5000,
        has_sync_variants: false,
        has_otel: false,
        api_rate_limit_size: 'm',
        auto_idle: true,
        created_at: new Date(),
        updated_at: new Date(),
        ...override
    };
}
