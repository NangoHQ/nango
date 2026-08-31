import { describe, expect, it } from 'vitest';

import { isRetiredPlan } from './planVisibility';

describe('isRetiredPlan', () => {
    it('closes the plans September 2026 stops selling', () => {
        expect(isRetiredPlan('starter-v2')).toBe(true);
        expect(isRetiredPlan('growth-v2')).toBe(true);
        expect(isRetiredPlan('growth-legacy')).toBe(true);
    });

    it('leaves the plans still on sale open', () => {
        expect(isRetiredPlan('free')).toBe(false);
        expect(isRetiredPlan('pay-as-you-go')).toBe(false);
        expect(isRetiredPlan('enterprise')).toBe(false);
    });
});
