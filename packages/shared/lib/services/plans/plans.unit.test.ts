import { describe, expect, it } from 'vitest';

import { getPlanDefinition } from './definitions.js';
import { mergeFlags } from './plans.js';

import type { DBPlan, PlanDefinition } from '@nangohq/types';

describe('mergeFlags', () => {
    it('should enable RBAC by default on free-uncapped, startup-deal, growth, growth-v2 and enterprise plans', () => {
        expect(getPlanDefinition('free')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('starter')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('starter-v2')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('starter-legacy')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('scale-legacy')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('growth-legacy')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('growth')?.flags.has_rbac).toBe(true);
        expect(getPlanDefinition('growth-v2')?.flags.has_rbac).toBe(true);
        expect(getPlanDefinition('enterprise')?.flags.has_rbac).toBe(true);
        expect(getPlanDefinition('enterprise-cloud-hosted')?.flags.has_rbac).toBe(true);
        expect(getPlanDefinition('free-uncapped')?.flags.has_rbac).toBe(true);
        expect(getPlanDefinition('startup-deal')?.flags.has_rbac).toBe(true);
    });

    describe.each([
        { from: 'starter-v2', to: 'free' },
        { from: 'growth-v2', to: 'starter-v2' },
        { from: 'enterprise-cloud-hosted', to: 'free' },
        { from: 'enterprise-cloud-hosted', to: 'starter-v2' },
        { from: 'enterprise-cloud-hosted', to: 'growth-v2' },
        { from: 'enterprise-cloud-hosted', to: 'enterprise' },
        { from: 'enterprise-cloud-hosted', to: 'free-uncapped' },
        { from: 'enterprise-cloud-hosted', to: 'startup-deal' },
        { from: 'free-uncapped', to: 'free' },
        { from: 'free-uncapped', to: 'starter-v2' },
        { from: 'free-uncapped', to: 'growth-v2' },
        { from: 'free-uncapped', to: 'enterprise' },
        { from: 'free-uncapped', to: 'enterprise-cloud-hosted' },
        { from: 'free-uncapped', to: 'startup-deal' },
        { from: 'startup-deal', to: 'free' },
        { from: 'startup-deal', to: 'free-uncapped' },
        { from: 'startup-deal', to: 'starter-v2' }
    ] as { from: PlanDefinition['code']; to: PlanDefinition['code'] }[])('when downgrading from $from to $to', ({ from, to }) => {
        it('should reset all flags to new plan default values, including overrides', () => {
            const currentPlan = makePlan({
                code: from,
                flagOverrides: {
                    environments_max: 99,
                    api_rate_limit_size: 'xl',
                    has_otel: true,
                    proxy_max: 99_999_999
                }
            });
            const newPlanDefinition = getPlanDefinition(to)!;
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

    it('never manages concurrency overrides, leaving them on the plan row across plan changes', () => {
        const currentPlan = makePlan({ code: 'starter-v2', flagOverrides: {} });
        currentPlan.sync_max_concurrency_override = 3;
        currentPlan.action_max_concurrency_override = 4;
        currentPlan.webhook_max_concurrency_override = 5;
        currentPlan.on_event_max_concurrency_override = 6;

        // Concurrency overrides are not plan-tier flags, so mergeFlags must not emit them (upgrade or downgrade)
        const upgraded = mergeFlags({ currentPlan, newPlanDefinition: getPlanDefinition('growth-v2')! });
        const downgraded = mergeFlags({ currentPlan, newPlanDefinition: getPlanDefinition('free')! });

        for (const flags of [upgraded, downgraded]) {
            expect(flags).not.toHaveProperty('sync_max_concurrency_override');
            expect(flags).not.toHaveProperty('action_max_concurrency_override');
            expect(flags).not.toHaveProperty('webhook_max_concurrency_override');
            expect(flags).not.toHaveProperty('on_event_max_concurrency_override');
        }
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
        has_otel: false,
        has_webhooks_forward: false,
        has_webhooks_script: false,
        has_rbac: false,
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
        sync_lambda_checkpoint_required: true,
        action_function_runtime: 'runner',
        webhook_function_runtime: 'runner',
        on_event_function_runtime: 'runner',
        has_records_autopruning: true,
        variants_per_sync_max: 100,
        sync_max_concurrency_override: null,
        action_max_concurrency_override: null,
        webhook_max_concurrency_override: null,
        on_event_max_concurrency_override: null,
        fleet_node_routing_override: null,
        records_store: 'default',
        lambda_tenant_isolation: defaultPlanDefinition.flags.lambda_tenant_isolation ?? false,
        export_runner_telemetry: defaultPlanDefinition.flags.export_runner_telemetry ?? false,
        ...defaultPlanDefinition,
        ...flagOverrides
    };
}
