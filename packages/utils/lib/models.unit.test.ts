import { describe, expect, it } from 'vitest';

import { BASE_SYNC_VARIANT, getModelFullName } from './models.js';

describe('getModelFullName', () => {
    it('returns the plain model name for the base variant', () => {
        expect(getModelFullName('Customers', BASE_SYNC_VARIANT)).toBe('Customers');
    });

    it('suffixes the model name with the variant for non-base variants', () => {
        expect(getModelFullName('Customers', 'eu')).toBe('Customers::eu');
    });
});
