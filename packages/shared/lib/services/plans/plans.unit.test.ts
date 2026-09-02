import { describe, expect, it } from 'vitest';

import { getPlanDefinition, plansList } from './definitions.js';
import { mergeFlags } from './plans.js';

import type { DBPlan, PlanDefinition } from '@nangohq/types';

describe('mergeFlags', () => {
    it('should cap only connections and function runtime on the free plan', () => {
        expect(getPlanDefinition('free')?.flags).toMatchObject({
            connections_max: 10,
            function_duration_seconds_max: 36_000,
            records_max: null,
            proxy_max: null,
            function_executions_max: null,
            function_compute_gbms_max: null,
            webhook_forwards_max: null,
            function_logs_max: null
        });
    });

    it('should enable RBAC by default on free-uncapped, startup-deal, growth, growth-v2 and enterprise plans', () => {
        expect(getPlanDefinition('free')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('starter')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('starter-v2')?.flags.has_rbac).toBe(false);
        expect(getPlanDefinition('pay-as-you-go')?.flags.has_rbac).toBe(false);
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

    it('should enable control-plane audit trail ingestion by default on every plan but free', () => {
        expect(getPlanDefinition('free')?.flags.has_audit_trail_control_plane).toBe(false);
        for (const plan of plansList.filter((p) => p.code !== 'free')) {
            expect(plan.flags.has_audit_trail_control_plane, plan.code).toBe(true);
        }
    });

    it('should not grant the audit trail UI on any plan, since it is enabled per account by hand', () => {
        for (const plan of plansList) {
            expect(plan.flags.has_audit_trail_access, plan.code).toBeUndefined();
        }
    });

    describe.each([
        { from: 'starter-v2', to: 'free' },
        { from: 'pay-as-you-go', to: 'free' },
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
                    proxy_max: 99_999_999,
                    has_audit_trail_control_plane: true,
                    has_audit_trail_access: true
                }
            });
            const newPlanDefinition = getPlanDefinition(to)!;
            const newFlags = mergeFlags({
                currentPlan,
                newPlanDefinition
            });

            expect(newFlags).toMatchObject(newPlanDefinition.flags);
            // No plan grants the audit trail UI, so it is absent from the merge and the column keeps
            // whatever was set by hand — unlike every other flag, a downgrade does not revoke it.
            expect(newFlags).not.toHaveProperty('has_audit_trail_access');
        });
    });

    describe.each([
        { from: 'free', to: 'starter-v2' }, // upgrade from free
        { from: 'starter-v2', to: 'growth-v2' }, // upgrade from paid
        { from: 'starter', to: 'starter-v2' }, // migration
        { from: 'starter-legacy', to: 'starter-v2' }, // migration
        { from: 'starter', to: 'growth-v2' }, // upgrade and migration
        { from: 'starter-legacy', to: 'growth-v2' }, // upgrade and migration
        { from: 'free', to: 'pay-as-you-go' }, // upgrade from free
        { from: 'starter-v2', to: 'pay-as-you-go' }, // migration off a sunset plan
        { from: 'growth-v2', to: 'pay-as-you-go' } // migration off a sunset plan
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
                    can_disable_connect_ui_watermark: false,
                    has_audit_trail_control_plane: false,
                    has_audit_trail_access: true
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
                api_rate_limit_size: '2xl', // Keep override
                has_audit_trail_control_plane: true // New plan grants it, so a paid plan always ends up recording
                // proxy_max: new plan more generous default (null)
                // auto_idle: new plan more generous default (false)
                // can_disable_connect_ui_watermark: new plan more generous default (true)
            });
            expect(newFlags).not.toHaveProperty('has_audit_trail_access');
        });
    });

    // pay-as-you-go carries starter-level flags until the growth add-on exists, so migrating a
    // Growth customer onto it must not be a downgrade — otherwise mergeFlags would reset their
    // flags to the starter defaults and silently revoke the features they pay for today.
    it('should keep growth features when migrating a growth-v2 account to pay-as-you-go', () => {
        const currentPlan = makePlan({
            code: 'growth-v2',
            flagOverrides: {
                has_rbac: true,
                has_otel: true,
                can_customize_connect_ui_theme: true,
                can_override_docs_connect_url: true,
                api_rate_limit_size: 'xl'
            }
        });
        const newPlanDefinition = getPlanDefinition('pay-as-you-go')!;

        const newFlags = mergeFlags({ currentPlan, newPlanDefinition });

        expect(newFlags).toMatchObject({
            has_rbac: true,
            has_otel: true,
            can_customize_connect_ui_theme: true,
            can_override_docs_connect_url: true,
            api_rate_limit_size: 'xl'
        });
    });
});

describe('self-serve transitions', () => {
    const starter = getPlanDefinition('starter-v2')!;
    const growth = getPlanDefinition('growth-v2')!;

    it('should not offer a move between the sunset starter-v2 and growth-v2 plans', () => {
        expect(starter.nextPlan).not.toContain('growth-v2');
        expect(starter.prevPlan).not.toContain('growth-v2');
        expect(growth.nextPlan).not.toContain('starter-v2');
        expect(growth.prevPlan).not.toContain('starter-v2');
    });

    it('should keep the moves off a sunset plan that stay open', () => {
        expect(starter.prevPlan).toContain('free');
        expect(starter.nextPlan).toContain('enterprise');
        expect(growth.prevPlan).toContain('free');
        expect(growth.nextPlan).toContain('enterprise');
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
        has_audit_trail_control_plane: false,
        has_audit_trail_access: false,
        can_customize_connect_ui_theme: false,
        can_override_docs_connect_url: false,
        can_disable_connect_ui_watermark: false,
        environments_max: 2,
        connections_max: null,
        records_max: null,
        proxy_max: null,
        function_executions_max: null,
        function_compute_gbms_max: null,
        function_duration_seconds_max: null,
        webhook_forwards_max: null,
        function_logs_max: null,
        sync_function_runtime: 'runner',
        sync_lambda_checkpoint_required: true,
        action_function_runtime: 'runner',
        webhook_function_runtime: 'runner',
        on_event_function_runtime: 'runner',
        function_runtime: 'lambda',
        has_records_autopruning: true,
        variants_per_sync_max: 100,
        fleet_node_routing_override: null,
        records_store: 'default',
        lambda_tenant_isolation: defaultPlanDefinition.flags.lambda_tenant_isolation ?? false,
        export_runner_telemetry: defaultPlanDefinition.flags.export_runner_telemetry ?? false,
        ...defaultPlanDefinition,
        ...flagOverrides
    };
}
