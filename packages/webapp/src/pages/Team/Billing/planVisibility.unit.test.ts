import { describe, expect, it } from 'vitest';

import { showsRetiredPlanCards } from './planVisibility';

import type { ApiPlan } from '@nangohq/types';

describe('showsRetiredPlanCards', () => {
    const of = (name: ApiPlan['name']) => showsRetiredPlanCards({ name } as ApiPlan);

    it('keeps the old cards for the plans September 2026 retires', () => {
        expect(of('starter-v2')).toBe(true);
        expect(of('growth-v2')).toBe(true);
        expect(of('growth-legacy')).toBe(true);
    });

    it('offers the new cards to everyone still on sale', () => {
        expect(of('free')).toBe(false);
        expect(of('pay-as-you-go')).toBe(false);
        expect(of('enterprise')).toBe(false);
    });

    it('offers the new cards before the plan has loaded', () => {
        expect(showsRetiredPlanCards(undefined)).toBe(false);
    });
});
