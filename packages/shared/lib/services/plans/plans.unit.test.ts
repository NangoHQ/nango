import { describe, expect, it } from 'vitest';

import { getPlanDefinition } from './definitions.js';
import { mergeFlags } from './plans.js';

import type { DBPlan, PlanDefinition } from '@nangohq/types';

describe('mergeFlags', () => {
    describe('when downgrading', () => {
        it('should reset all flags to new plan default values, including overrides', () => {
            const currentPlan = makePlan({
                code: 'starter-v2',
                flagOverrides: {
                    environments_max: 99,
                    api_rate_limit_size: 'xl',
                    has_otel: true,
                    proxy_max: 99_999_999
                }
            });
            const newPlanDefinition = getPlanDefinition('free')!;
            const newFlags = mergeFlags({
                currentPlan,
                newPlanDefinition
            });

            expect(newFlags).toMatchObject(newPlanDefinition.flags);
        });
    });

    describe.each([
        { from: 'free', to: 'starter-v2' }, // upgrade from free
        { from: 'starter-v2', to: 'growth-v2' }, // upgrade from paid
        { from: 'starter', to: 'starter-v2' }, // migration
        { from: 'starter-legacy', to: 'starter-v2' }, // migration
        { from: 'starter', to: 'growth-v2' }, // upgrade and migration
        { from: 'starter-legacy', to: 'growth-v2' } // upgrade and migration
    ] as { from: PlanDefinition['code']; to: PlanDefinition['code'] }[])('when upgrading/migrating from $from to $to', ({ from, to }) => {
        it('should apply new plan defaults if no overrides', () => {
            const currentPlan = makePlan({ code: from, flagOverrides: {} });
            const newPlanDefinition = getPlanDefinition(to)!;
            const newFlags = mergeFlags({
                currentPlan,
                newPlanDefinition
            });
            expect(newFlags).toMatchObject(newPlanDefinition.flags);
        });
        it('should apply new plan defaults and keep more generous overrides', () => {
            const currentPlan = makePlan({
                code: from,
                flagOverrides: {
                    environments_max: 50,
                    has_otel: true,
                    api_rate_limit_size: '2xl',
                    proxy_max: 99_999_999,
                    auto_idle: true,
                    can_disable_connect_ui_watermark: false
                }
            });
            const newPlanDefinition = getPlanDefinition(to)!;
            const newFlags = mergeFlags({
                currentPlan,
                newPlanDefinition
            });

            expect(newFlags).toMatchObject({
                ...newPlanDefinition.flags,
                environments_max: 50, // Keep override
                has_otel: true, // Keep override
                api_rate_limit_size: '2xl' // Keep override
                // proxy_max: new plan more generous default (null)
                // auto_idle: new plan more generous default (false)
                // can_disable_connect_ui_watermark: new plan more generous default (true)
            });
        });
    });
});

function makePlan({ code, flagOverrides }: { code: DBPlan['name']; flagOverrides: PlanDefinition['flags'] }): DBPlan {
    const defaultPlanDefinition = getPlanDefinition(code)!;
    return {
        id: 1,
        account_id: 1,
        name: code,
        created_at: new Date(),
        updated_at: new Date(),
        stripe_customer_id: null,
        stripe_payment_id: null,
        orb_customer_id: null,
        orb_subscription_id: null,
        orb_future_plan: null,
        orb_future_plan_at: null,
        orb_subscribed_at: null,
        trial_start_at: null,
        trial_end_at: null,
        trial_extension_count: 0,
        trial_end_notified_at: null,
        trial_expired: null,
        api_rate_limit_size: 'm',
        monthly_actions_max: null,
        monthly_active_records_max: null,
        sync_frequency_secs_min: 3600,
        auto_idle: false,
        has_sync_variants: false,
        has_otel: false,
        has_webhooks_forward: false,
        has_webhooks_script: false,
        can_customize_connect_ui_theme: false,
        can_override_docs_connect_url: false,
        can_disable_connect_ui_watermark: false,
        environments_max: 2,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        webhook_forwards_max: null,
        function_logs_max: null,
        sync_function_runtime: 'runner',
        action_function_runtime: 'runner',
        webhook_function_runtime: 'runner',
        on_event_function_runtime: 'runner',
        ...defaultPlanDefinition,
        ...flagOverrides
    };
}
