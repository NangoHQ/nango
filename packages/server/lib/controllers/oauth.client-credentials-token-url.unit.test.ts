import { describe, expect, it } from 'vitest';

import { getProvider } from '@nangohq/providers';

import { missesInterpolationParam } from '../utils/utils.js';

describe('client-credentials token URL interpolation gate', () => {
    it('does not reject an attacker-chosen ADOXX base URL once the placeholder is filled', () => {
        const catalog = getProvider('adoxx-cc');
        const tokenUrl = catalog?.token_url;
        expect(typeof tokenUrl).toBe('string');

        expect(missesInterpolationParam(tokenUrl as string, { baseUrl: 'example.com' })).toBe(false);
        expect(missesInterpolationParam(tokenUrl as string, {})).toBe(true);
    });
});
