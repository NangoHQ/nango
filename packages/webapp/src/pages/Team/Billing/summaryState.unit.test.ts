import { describe, expect, it } from 'vitest';

import { buildSummaryState, showsSummaryStrip } from './summaryState.js';

import type { ApiPlan, PlanDefinition, StripePaymentMethod } from '@nangohq/types';

const NOW = new Date('2026-08-17T10:00:00Z');

const plans = [
    { code: 'free', title: 'Free' },
    { code: 'starter-v2', title: 'Starter' },
    { code: 'growth-v2', title: 'Growth' },
    { code: 'startup-deal', title: 'Startup deal' }
] as PlanDefinition[];

const card: StripePaymentMethod = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 };

function planOf(name: ApiPlan['name'], overrides: Partial<ApiPlan> = {}): ApiPlan {
    return { name, orb_future_plan: null, orb_future_plan_at: null, ...overrides } as ApiPlan;
}
function build(plan: ApiPlan, opts: { paymentMethod?: StripePaymentMethod | null; canManageBilling?: boolean } = {}) {
    return buildSummaryState({
        plan,
        plans,
        paymentMethod: opts.paymentMethod ?? null,
        canManageBilling: opts.canManageBilling ?? true,
        now: NOW
    });
}

describe('showsSummaryStrip', () => {
    it('renders for the four current plans', () => {
        for (const name of ['free', 'starter-v2', 'growth-v2', 'startup-deal'] as const) {
            expect(showsSummaryStrip(planOf(name))).toBe(true);
        }
    });

    it('hides for legacy, enterprise and free-uncapped', () => {
        for (const name of [
            'starter-legacy',
            'scale-legacy',
            'growth',
            'starter',
            'growth-legacy',
            'enterprise',
            'enterprise-cloud-hosted',
            'free-uncapped'
        ] as const) {
            expect(showsSummaryStrip(planOf(name))).toBe(false);
        }
    });

    it('hides when the plan is not loaded yet', () => {
        expect(showsSummaryStrip(null)).toBe(false);
    });
});

describe('buildSummaryState', () => {
    it('shows Free the caps reset and never a payment method, even with a card', () => {
        const state = build(planOf('free'), { paymentMethod: card });
        expect(state.planTitle).toBe('Free');
        expect(state.date).toEqual({ label: 'LIMITS RESET', value: 'September 1, 2026' });
        expect(state.payment).toBeNull();
    });

    it('shows paid plans a renewal date and the card', () => {
        const state = build(planOf('starter-v2'), { paymentMethod: card });
        expect(state.date).toEqual({ label: 'RENEWS ON', value: 'September 1, 2026' });
        expect(state.payment).toEqual({ card });
    });

    it('hides the payment slot from viewers who cannot manage billing', () => {
        expect(build(planOf('growth-v2'), { paymentMethod: card, canManageBilling: false }).payment).toBeNull();
    });

    it('hides the payment slot entirely when there is no card', () => {
        expect(build(planOf('starter-v2')).payment).toBeNull();
    });

    it('says nothing about dates for a deal whose conversion date is missing', () => {
        // The deal never renews, so "Renews on" would be a lie — see NAN-6640 for the missing dates.
        expect(build(planOf('startup-deal')).date).toBeNull();
    });

    it('announces a scheduled change instead of a renewal', () => {
        const state = build(planOf('startup-deal', { orb_future_plan: 'growth-v2', orb_future_plan_at: '2026-09-25T00:00:00.000Z' }));
        expect(state.date).toEqual({ label: 'CHANGES ON', value: 'September 25, 2026' });
        expect(state.change).toEqual({
            toPlanTitle: 'Growth',
            at: 'September 25, 2026',
            detail: "your startup deal ends and you'll be charged at standard Growth pricing."
        });
    });

    it('announces a downgrade the same way', () => {
        const state = build(planOf('growth-v2', { orb_future_plan: 'free', orb_future_plan_at: '2026-09-01T00:00:00.000Z' }));
        expect(state.date?.label).toBe('CHANGES ON');
        expect(state.change).toEqual({ toPlanTitle: 'Free', at: 'September 1, 2026', detail: 'no further charges after this period.' });
    });

    it('ignores a change to the same plan — those are Orb-side repricings', () => {
        const state = build(planOf('starter-v2', { orb_future_plan: 'starter-v2', orb_future_plan_at: '2026-10-01T00:00:00.000Z' }));
        expect(state.date?.label).toBe('RENEWS ON');
        expect(state.change).toBeNull();
    });

    it('ignores a change date that has already passed — stale mirror rows', () => {
        const state = build(planOf('growth-v2', { orb_future_plan: 'free', orb_future_plan_at: '2026-07-01T00:00:00.000Z' }));
        expect(state.date?.label).toBe('RENEWS ON');
        expect(state.change).toBeNull();
    });

    it('explains a paid-to-paid downgrade in terms of the new plan', () => {
        const state = build(planOf('growth-v2', { orb_future_plan: 'starter-v2', orb_future_plan_at: '2026-09-01T00:00:00.000Z' }));
        expect(state.change?.detail).toBe("you'll be charged at standard Starter pricing.");
    });

    it('falls back to the plan code when the plan list has not loaded', () => {
        const state = buildSummaryState({ plan: planOf('growth-v2'), plans: undefined, paymentMethod: null, canManageBilling: true, now: NOW });
        expect(state.planTitle).toBe('growth-v2');
    });
});
