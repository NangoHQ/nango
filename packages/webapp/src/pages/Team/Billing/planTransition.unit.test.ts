import { describe, expect, it } from 'vitest';

import { planTransition } from './planTransition.js';

import type { ApiPlan, PlanDefinition } from '@nangohq/types';

const NOW = new Date('2026-09-03T10:00:00Z');
const IN_SCOPE = ['starter-v2', 'growth-v2'] as const;

const plans = [
    { code: 'free', title: 'Free' },
    { code: 'pay-as-you-go', title: 'Pay-as-you-go' },
    { code: 'starter-v2', title: 'Starter' },
    { code: 'growth-v2', title: 'Growth' },
    { code: 'startup-deal', title: 'Startup deal' }
] as PlanDefinition[];

function planOf(name: ApiPlan['name'], overrides: Partial<ApiPlan> = {}): ApiPlan {
    return { name, orb_future_plan: null, orb_future_plan_at: null, ...overrides } as ApiPlan;
}

function scheduled(name: ApiPlan['name'], target = 'pay-as-you-go', at = '2026-10-01T00:00:00Z'): ApiPlan {
    return planOf(name, { orb_future_plan: target, orb_future_plan_at: at });
}

function transitionOf(plan: ApiPlan) {
    return planTransition({ plan, plans, now: NOW });
}

describe('planTransition', () => {
    it('announces the migration for both retired v2 plans', () => {
        for (const name of IN_SCOPE) {
            expect(transitionOf(scheduled(name))).toEqual({
                at: 'October 1, 2026',
                toPlanTitle: 'Pay-as-you-go',
                fromCode: name,
                keepsGrowthAddOn: name === 'growth-v2'
            });
        }
    });

    it('carries the add-on across for Growth only, since Pay-as-you-go matches Starter otherwise', () => {
        expect(transitionOf(scheduled('growth-v2'))?.keepsGrowthAddOn).toBe(true);
        expect(transitionOf(scheduled('starter-v2'))?.keepsGrowthAddOn).toBe(false);
    });

    it('stays silent for an account with nothing scheduled', () => {
        for (const name of IN_SCOPE) {
            expect(transitionOf(planOf(name))).toBeNull();
        }
    });

    it('stays silent for plans out of scope, whatever is scheduled', () => {
        for (const name of ['free', 'startup-deal', 'growth', 'starter', 'growth-legacy', 'enterprise'] as const) {
            expect(transitionOf(scheduled(name))).toBeNull();
        }
    });

    it('ignores a change that lands somewhere other than Pay-as-you-go', () => {
        expect(transitionOf(scheduled('growth-v2', 'free'))).toBeNull();
        expect(transitionOf(scheduled('growth-v2', 'growth-v2'))).toBeNull();
    });

    it('ignores a past-dated mirror, which nothing clears once the date passes', () => {
        expect(transitionOf(scheduled('growth-v2', 'pay-as-you-go', '2026-08-01T00:00:00Z'))).toBeNull();
    });

    it('ignores an unparseable date rather than rendering one', () => {
        expect(transitionOf(scheduled('growth-v2', 'pay-as-you-go', 'not-a-date'))).toBeNull();
    });

    it('waits for the plans list, so the banner never names a raw plan code', () => {
        expect(planTransition({ plan: scheduled('growth-v2'), plans: undefined, now: NOW })).toBeNull();
    });

    it('stays silent while the plan is still loading', () => {
        expect(planTransition({ plan: null, plans, now: NOW })).toBeNull();
    });
});
