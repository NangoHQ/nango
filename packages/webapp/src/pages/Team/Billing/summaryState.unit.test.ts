import { describe, expect, it } from 'vitest';

import { hasMonthlySpend, isBilledPlan, isLegacyPlan, planAccruesCharges, showsSummaryStrip } from './planVisibility.js';
import { buildSummaryState, pendingPlanChange, SPEND_TOOLTIP, SPEND_TOOLTIP_S26, SPEND_TOOLTIP_WITHOUT_CHARGES } from './summaryState.js';

import type { SummarySpend } from './summaryState.js';
import type { ApiPlan, PlanDefinition, StripePaymentMethod } from '@nangohq/types';

const NOW = new Date('2026-08-17T10:00:00Z');

const plans = [
    { code: 'free', title: 'Free' },
    { code: 'pay-as-you-go', title: 'Pay as you go' },
    { code: 'starter-v2', title: 'Starter' },
    { code: 'growth-v2', title: 'Growth' },
    { code: 'startup-deal', title: 'Startup deal' }
] as PlanDefinition[];

const card: StripePaymentMethod = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028 };

function planOf(name: ApiPlan['name'], overrides: Partial<ApiPlan> = {}): ApiPlan {
    return { name, orb_future_plan: null, orb_future_plan_at: null, ...overrides } as ApiPlan;
}
function build(
    plan: ApiPlan,
    opts: { paymentMethod?: StripePaymentMethod | null; canManageBilling?: boolean; spend?: SummarySpend | null; onS26Pricing?: boolean } = {}
) {
    return buildSummaryState({
        plan,
        plans,
        paymentMethod: opts.paymentMethod ?? null,
        canManageBilling: opts.canManageBilling ?? true,
        spend: opts.spend ?? null,
        onS26Pricing: opts.onS26Pricing ?? false,
        now: NOW
    });
}

/** A resolved spend read, as `Summary` would hand it over. */
function spendOf(amountInCents: number | null, currency: string | null = 'USD'): SummarySpend {
    return { amountInCents, currency };
}

describe('showsSummaryStrip', () => {
    it('renders for the current plans', () => {
        for (const name of ['free', 'pay-as-you-go', 'starter-v2', 'growth-v2', 'startup-deal'] as const) {
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

describe('hasMonthlySpend', () => {
    it('leads with spend on the plans billed monthly', () => {
        for (const name of ['pay-as-you-go', 'starter-v2', 'growth-v2', 'startup-deal'] as const) {
            expect(hasMonthlySpend(planOf(name))).toBe(true);
        }
    });

    it('keeps the plan headline everywhere else', () => {
        for (const name of [
            'free',
            'free-uncapped',
            'enterprise',
            'enterprise-cloud-hosted',
            'starter',
            'growth',
            'starter-legacy',
            'scale-legacy',
            'growth-legacy'
        ] as const) {
            expect(hasMonthlySpend(planOf(name))).toBe(false);
        }
    });

    it('handles a missing plan', () => {
        expect(hasMonthlySpend(null)).toBe(false);
        expect(hasMonthlySpend(undefined)).toBe(false);
    });
});

describe('planAccruesCharges', () => {
    it('is true for the plans with a base fee and billable overage', () => {
        for (const name of ['pay-as-you-go', 'starter-v2', 'growth-v2'] as const) {
            expect(planAccruesCharges(planOf(name))).toBe(true);
        }
    });

    it('is false for the startup deal, which has neither until it converts', () => {
        expect(planAccruesCharges(planOf('startup-deal'))).toBe(false);
    });

    it('drops only the breakdown sentence from the deal tooltip, keeping the caveats', () => {
        expect(SPEND_TOOLTIP).toContain("Next month's base fee");
        expect(SPEND_TOOLTIP_WITHOUT_CHARGES).not.toContain("Next month's base fee");
        expect(SPEND_TOOLTIP).toContain(SPEND_TOOLTIP_WITHOUT_CHARGES);
    });

    it('names the minimum rather than a base fee on the new pricing', () => {
        expect(SPEND_TOOLTIP_S26).toContain('$50 monthly minimum');
        expect(SPEND_TOOLTIP_S26).not.toContain('base fee');
        expect(SPEND_TOOLTIP_S26).toContain(SPEND_TOOLTIP_WITHOUT_CHARGES);
    });
});

describe('buildSummaryState headline', () => {
    it('leads with the formatted spend and demotes the plan to its own slot', () => {
        const state = build(planOf('growth-v2'), { spend: spendOf(128430) });
        expect(state.headline).toEqual({ label: 'CURRENT PERIOD SPEND', value: '$1,284.30', tooltip: SPEND_TOOLTIP });
        expect(state.plan).toEqual({ value: 'Growth' });
    });

    it('explains the spend as a minimum for an account on the new pricing', () => {
        const state = build(planOf('pay-as-you-go'), { spend: spendOf(1200), onS26Pricing: true });
        expect(state.headline).toEqual({ label: 'CURRENT PERIOD SPEND', value: '$12.00', tooltip: SPEND_TOOLTIP_S26 });
    });

    it('reports $0.00 on the startup deal rather than treating it as missing', () => {
        // The deal rates to $0.00 at any volume, so zero is the answer, not a gap.
        const state = build(planOf('startup-deal'), { spend: spendOf(0) });
        expect(state.headline).toEqual({ label: 'CURRENT PERIOD SPEND', value: '$0.00', tooltip: SPEND_TOOLTIP_WITHOUT_CHARGES });
        expect(state.plan).toEqual({ value: 'Startup deal' });
    });

    it('falls back to the plan name when the read failed or Orb had nothing', () => {
        const state = build(planOf('growth-v2'), { spend: spendOf(null, null) });
        expect(state.headline).toEqual({ label: 'CURRENT PLAN', value: 'Growth' });
        expect(state.headline.tooltip).toBeUndefined();
        expect(state.plan).toBeNull();
    });

    it('falls back to the plan name when the currency has no symbol to show', () => {
        const state = build(planOf('growth-v2'), { spend: spendOf(128430, 'credits') });
        expect(state.headline).toEqual({ label: 'CURRENT PLAN', value: 'Growth' });
    });

    it('never leads with spend on Free, even if a figure is handed over', () => {
        const state = build(planOf('free'), { spend: spendOf(128430) });
        expect(state.headline).toEqual({ label: 'CURRENT PLAN', value: 'Free' });
        expect(state.plan).toBeNull();
    });

    it('renders exactly as before when spend is not being read at all', () => {
        // The rollout flag reaches this function as `spend: null`, and off has to be
        // indistinguishable from the pre-spend strip.
        for (const name of ['starter-v2', 'growth-v2', 'startup-deal'] as const) {
            const state = build(planOf(name), { spend: null });
            expect(state.headline.label).toBe('CURRENT PLAN');
            expect(state.headline.tooltip).toBeUndefined();
            expect(state.plan).toBeNull();
        }
    });
});

describe('isLegacyPlan', () => {
    it('flags only the plans on the old usage model', () => {
        for (const name of ['starter', 'growth', 'starter-legacy', 'scale-legacy', 'growth-legacy'] as const) {
            expect(isLegacyPlan(planOf(name))).toBe(true);
        }
    });

    // A bespoke contract isn't the same thing as an old usage model, so Enterprise gets the normal
    // usage view rather than the legacy-plan banner.
    it('does not flag current plans, including the custom-contract ones', () => {
        for (const name of [
            'free',
            'free-uncapped',
            'pay-as-you-go',
            'starter-v2',
            'growth-v2',
            'startup-deal',
            'enterprise',
            'enterprise-cloud-hosted'
        ] as const) {
            expect(isLegacyPlan(planOf(name))).toBe(false);
        }
    });

    it('does not flag anything before the plan loads', () => {
        expect(isLegacyPlan(null)).toBe(false);
    });
});

describe('isBilledPlan', () => {
    it('excludes both free tiers, which have no invoices to link to', () => {
        for (const name of ['free', 'free-uncapped'] as const) {
            expect(isBilledPlan(planOf(name))).toBe(false);
        }
    });

    it('includes every paid plan, current and legacy', () => {
        for (const name of [
            'pay-as-you-go',
            'starter-v2',
            'growth-v2',
            'enterprise',
            'enterprise-cloud-hosted',
            'startup-deal',
            'starter',
            'growth',
            'starter-legacy',
            'scale-legacy',
            'growth-legacy'
        ] as const) {
            expect(isBilledPlan(planOf(name))).toBe(true);
        }
    });

    it('is false before the plan loads, so no request fires', () => {
        expect(isBilledPlan(null)).toBe(false);
    });
});

describe('buildSummaryState', () => {
    it('shows Free the caps reset and never a payment method, even with a card', () => {
        const state = build(planOf('free'), { paymentMethod: card });
        expect(state.headline).toEqual({ label: 'CURRENT PLAN', value: 'Free' });
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
            toCode: 'growth-v2',
            toPlanTitle: 'Growth',
            at: 'September 25, 2026',
            detail: "your startup deal ends and you'll be charged at standard Growth pricing."
        });
    });

    it('announces a downgrade the same way', () => {
        const state = build(planOf('growth-v2', { orb_future_plan: 'free', orb_future_plan_at: '2026-09-01T00:00:00.000Z' }));
        expect(state.date?.label).toBe('CHANGES ON');
        expect(state.change).toEqual({ toCode: 'free', toPlanTitle: 'Free', at: 'September 1, 2026', detail: 'no further charges after this period.' });
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

    it('promises no further charges when moving to either free plan', () => {
        for (const target of ['free', 'free-uncapped'] as const) {
            const state = build(planOf('growth-v2', { orb_future_plan: target, orb_future_plan_at: '2026-09-01T00:00:00.000Z' }));
            expect(state.change?.detail).toBe('no further charges after this period.');
        }
    });

    it('adds no gloss to a paid-to-paid downgrade — the new plan name says it', () => {
        const state = build(planOf('growth-v2', { orb_future_plan: 'starter-v2', orb_future_plan_at: '2026-09-01T00:00:00.000Z' }));
        expect(state.change).toEqual({ toCode: 'starter-v2', toPlanTitle: 'Starter', at: 'September 1, 2026', detail: null });
    });

    it('falls back to the plan code when the plan list has not loaded', () => {
        const state = buildSummaryState({
            plan: planOf('growth-v2'),
            plans: undefined,
            paymentMethod: null,
            canManageBilling: true,
            onS26Pricing: false,
            now: NOW
        });
        expect(state.headline.value).toBe('growth-v2');
    });
});

describe('pendingPlanChange guards', () => {
    const at = '2026-09-25T00:00:00.000Z';

    it('says nothing rather than naming a raw Orb code', () => {
        const plan = planOf('startup-deal', { orb_future_plan: 'growth-v2', orb_future_plan_at: at });
        expect(pendingPlanChange({ plan, plans: undefined, now: NOW })).toBeNull();
    });

    it('ignores a timestamp that does not parse', () => {
        const plan = planOf('growth-v2', { orb_future_plan: 'starter-v2', orb_future_plan_at: 'not-a-date' });
        expect(pendingPlanChange({ plan, plans, now: NOW })).toBeNull();
    });

    it('still announces a cancellation, which names no destination', () => {
        const plan = planOf('growth-v2', { orb_future_plan: 'free', orb_future_plan_at: at });
        const change = pendingPlanChange({ plan, plans: undefined, now: NOW });
        expect(change?.toCode).toBe('free');
        expect(change?.detail).toBe('no further charges after this period.');
    });
});
