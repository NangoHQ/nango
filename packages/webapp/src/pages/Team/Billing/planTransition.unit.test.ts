import { describe, expect, it } from 'vitest';

import { planTransition } from './planTransition.js';

import type { ApiPlan, PlanDefinition } from '@nangohq/types';

const NOW = new Date('2026-09-03T10:00:00Z');

const plans = [
    { code: 'free', title: 'Free' },
    { code: 'pay-as-you-go', title: 'Pay-as-you-go' },
    { code: 'starter-v2', title: 'Starter' },
    { code: 'growth-v2', title: 'Growth', keepsGrowthAddOnOnMigration: true },
    { code: 'startup-deal', title: 'Startup deal' },
    { code: 'starter', title: 'Starter (v1)' },
    { code: 'growth', title: 'Growth (v1)', keepsGrowthAddOnOnMigration: true },
    { code: 'starter-legacy', title: 'Starter (legacy)' },
    { code: 'scale-legacy', title: 'Scale (legacy)' },
    { code: 'growth-legacy', title: 'Growth (legacy)', keepsGrowthAddOnOnMigration: true },
    { code: 'enterprise', title: 'Enterprise' }
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
    it.each([
        ['starter-v2', 'Starter'],
        ['growth-v2', 'Growth'],
        ['starter-legacy', 'Starter (legacy)'],
        ['scale-legacy', 'Scale (legacy)'],
        ['growth-legacy', 'Growth (legacy)'],
        ['growth', 'Growth (v1)'],
        ['starter', 'Starter (v1)']
    ] as const)('announces the migration for a scheduled %s account', (name, fromTitle) => {
        expect(transitionOf(scheduled(name))).toMatchObject({
            at: 'October 1, 2026',
            toPlanTitle: 'Pay-as-you-go',
            fromCode: name,
            fromTitle
        });
    });

    it.each(['enterprise', 'startup-deal'] as const)('stays silent for a scheduled %s account', (name) => {
        expect(transitionOf(scheduled(name))).toBeNull();
    });

    it.each(['growth-v2', 'growth', 'growth-legacy'] as const)('carries the Growth add-on across for %s', (name) => {
        expect(transitionOf(scheduled(name))?.keepsGrowthAddOn).toBe(true);
    });

    it.each(['starter-v2', 'starter-legacy', 'scale-legacy'] as const)('carries no add-on for %s', (name) => {
        expect(transitionOf(scheduled(name))?.keepsGrowthAddOn).toBe(false);
    });

    it('stays silent for an account with nothing scheduled', () => {
        for (const name of ['starter-v2', 'growth-v2', 'starter-legacy'] as const) {
            expect(transitionOf(planOf(name))).toBeNull();
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
