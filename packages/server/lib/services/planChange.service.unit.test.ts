import { describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { getPlanChangeContext, resolvePlanChange } from './planChange.service.js';

import type { BillingSubscription, DBPlan, DBTeam, PlanDefinition } from '@nangohq/types';

const team = { id: 1 } as DBTeam;

function planOf(name: PlanDefinition['code'], hasGrowthFeatures: boolean, plan?: Partial<DBPlan>): DBPlan {
    return seeders.getTestPlan({ name, has_growth_features: hasGrowthFeatures, orb_subscription_id: 'sub_123', ...plan });
}

/**
 * Orb and the database agree by default, which is the state every transition case cares about. The
 * disagreement cases below override one side deliberately.
 */
function resolve({
    from,
    to,
    addonNow = false,
    addonRequested = false,
    subscription,
    plan
}: {
    from: PlanDefinition['code'];
    to: PlanDefinition['code'];
    addonNow?: boolean;
    addonRequested?: boolean;
    subscription?: Partial<BillingSubscription>;
    plan?: Partial<DBPlan>;
}) {
    const context = getPlanChangeContext(team, planOf(from, addonNow, plan), to, addonRequested).unwrap();

    return resolvePlanChange(context, {
        id: 'sub_123',
        planExternalId: from,
        hasGrowthFeatures: addonNow,
        growthFeaturesEndsAt: null,
        growthFeaturesPriceIntervalId: addonNow ? 'pi_growth' : null,
        ...subscription
    });
}

describe('resolvePlanChange', () => {
    it.each([
        { from: 'free', to: 'pay-as-you-go', plan: 'upgrade' },
        { from: 'free', to: 'enterprise', plan: 'upgrade' },
        { from: 'pay-as-you-go', to: 'enterprise', plan: 'upgrade' },
        { from: 'pay-as-you-go', to: 'free', plan: 'downgrade' },
        { from: 'starter-v2', to: 'enterprise', plan: 'upgrade' },
        { from: 'starter-v2', to: 'free', plan: 'downgrade' }
    ] as { from: PlanDefinition['code']; to: PlanDefinition['code']; plan: 'upgrade' | 'downgrade' }[])(
        'resolves $from -> $to as: $plan',
        ({ from, to, plan }) => {
            expect(resolve({ from, to }).unwrap()).toEqual({ plan, addon: null });
        }
    );

    // The startup deal is granted, never self-served, so free lists it in neither direction
    it('rejects a transition that is in neither nextPlan nor prevPlan', () => {
        const res = resolve({ from: 'free', to: 'startup-deal' });
        expect(res.isErr() && res.error.code).toBe('transition_not_allowed');
    });

    it.each([{ addon: false }, { addon: true }])('rejects a same plan transition with the add-on unchanged ($addon)', ({ addon }) => {
        const res = resolve({ from: 'pay-as-you-go', to: 'pay-as-you-go', addonNow: addon, addonRequested: addon });
        expect(res.isErr() && res.error.code).toBe('no_change_requested');
    });

    it('rejects when Orb and the database disagree on the plan', () => {
        const res = resolve({ from: 'free', to: 'pay-as-you-go', subscription: { planExternalId: 'pay-as-you-go' } });
        expect(res.isErr() && res.error.code).toBe('out_of_sync');
    });

    it('rejects when Orb and the database disagree on the subscription id', () => {
        const res = resolve({ from: 'free', to: 'pay-as-you-go', subscription: { id: 'sub_replaced' } });
        expect(res.isErr() && res.error.code).toBe('out_of_sync');
    });

    it('rejects when Orb and the database disagree on the add-on', () => {
        const res = resolve({ from: 'pay-as-you-go', to: 'enterprise', subscription: { hasGrowthFeatures: true } });
        expect(res.isErr() && res.error.code).toBe('out_of_sync');
    });

    it('rejects a downgrade to a plan that is already scheduled', () => {
        const res = resolve({ from: 'pay-as-you-go', to: 'free', plan: { orb_future_plan: 'free' } });
        expect(res.isErr() && res.error.code).toBe('already_scheduled');
    });

    it('allows an upgrade to a plan that is already scheduled', () => {
        expect(resolve({ from: 'free', to: 'pay-as-you-go', plan: { orb_future_plan: 'pay-as-you-go' } }).unwrap()).toEqual({
            plan: 'upgrade',
            addon: null
        });
    });

    it('rejects disabling the add-on when removal is already scheduled', () => {
        const res = resolve({
            from: 'pay-as-you-go',
            to: 'pay-as-you-go',
            addonNow: true,
            addonRequested: false,
            subscription: { growthFeaturesEndsAt: new Date('2026-10-01') }
        });
        expect(res.isErr() && res.error.code).toBe('already_scheduled');
    });

    it('resolves an add-on change on an unchanged plan as add-on only', () => {
        expect(resolve({ from: 'pay-as-you-go', to: 'pay-as-you-go', addonRequested: true }).unwrap()).toEqual({ plan: null, addon: 'enable' });
        expect(resolve({ from: 'pay-as-you-go', to: 'pay-as-you-go', addonNow: true }).unwrap()).toEqual({ plan: null, addon: 'disable' });
    });

    it('resolves a plan change that also moves the add-on as both', () => {
        expect(resolve({ from: 'free', to: 'pay-as-you-go', addonRequested: true }).unwrap()).toEqual({ plan: 'upgrade', addon: 'enable' });
        expect(resolve({ from: 'pay-as-you-go', to: 'free', addonNow: true }).unwrap()).toEqual({ plan: 'downgrade', addon: 'disable' });
    });

    it('resolves dropping the add-on while upgrading the plan as both', () => {
        expect(resolve({ from: 'pay-as-you-go', to: 'enterprise', addonNow: true }).unwrap()).toEqual({ plan: 'upgrade', addon: 'disable' });
    });

    it('rejects enabling the add-on on a plan that cannot carry it', () => {
        const res = resolve({ from: 'pay-as-you-go', to: 'free', addonRequested: true });
        expect(res.isErr() && res.error.code).toBe('growth_features_unavailable');
    });

    it('rejects a downgrade that would carry the add-on onto a plan that cannot have it', () => {
        const res = resolve({ from: 'pay-as-you-go', to: 'free', addonNow: true, addonRequested: true });
        expect(res.isErr() && res.error.code).toBe('growth_features_unavailable');
    });
});

describe('getPlanChangeContext', () => {
    const plan = (override: Partial<DBPlan>): DBPlan => seeders.getTestPlan({ orb_subscription_id: 'sub_123', ...override });
    const context = (p: DBPlan | null, newPlanCode = 'pay-as-you-go', withGrowthFeatures = false) =>
        getPlanChangeContext(team, p, newPlanCode, withGrowthFeatures);

    it('resolves the team, definition and subscription for a changeable plan', () => {
        expect(context(plan({ name: 'free' })).unwrap()).toMatchObject({
            team,
            currentPlan: { name: 'free' },
            currentPlanDefinition: { code: 'free' },
            subscriptionId: 'sub_123'
        });
    });

    // The requested state is carried verbatim: whether it is a legal change is getPlanChangeDirection's
    // question, so nothing here interprets or normalises it.
    it.each([
        { newPlanCode: 'pay-as-you-go', withGrowthFeatures: true },
        { newPlanCode: 'pay-as-you-go', withGrowthFeatures: false },
        { newPlanCode: 'enterprise', withGrowthFeatures: false },
        { newPlanCode: 'free', withGrowthFeatures: true }
    ])('carries the requested $newPlanCode / add-on $withGrowthFeatures through untouched', ({ newPlanCode, withGrowthFeatures }) => {
        const res = context(plan({ name: 'free' }), newPlanCode, withGrowthFeatures);
        expect(res.unwrap().requested).toEqual({ newPlanCode, withGrowthFeatures });
    });

    it('rejects an account with no plan at all', () => {
        const res = context(null);
        expect(res.isErr() && res.error.code).toBe('invalid_plan');
    });

    it('rejects a plan name that matches no definition', () => {
        const res = context(plan({ name: 'not-a-plan' as DBPlan['name'] }));
        expect(res.isErr() && res.error.code).toBe('invalid_plan');
    });

    it('rejects a plan with no orb subscription to change', () => {
        const res = context(plan({ name: 'free', orb_subscription_id: null }));
        expect(res.isErr() && res.error.code).toBe('no_subscription');
    });

    it('rejects a plan the customer cannot change themselves', () => {
        const res = context(plan({ name: 'enterprise' }));
        expect(res.isErr() && res.error.code).toBe('plan_not_changeable');
    });
});
