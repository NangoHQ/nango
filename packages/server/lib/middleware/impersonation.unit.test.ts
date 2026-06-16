import { describe, expect, it } from 'vitest';

import { resolveImpersonationRole } from './impersonation.js';

describe('resolveImpersonationRole', () => {
    it('forces the override role and flags enforcement on an impersonation session', () => {
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: true, override: 'production_support' })).toEqual({
            role: 'production_support',
            forced: true
        });
    });

    it('keeps the real role and does not force enforcement when the override is not configured', () => {
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: true, override: undefined })).toEqual({
            role: 'administrator',
            forced: false
        });
    });

    it('keeps the real role for non-impersonation sessions even when the override is configured', () => {
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: undefined, override: 'production_support' })).toEqual({
            role: 'administrator',
            forced: false
        });
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: false, override: 'production_support' })).toEqual({
            role: 'administrator',
            forced: false
        });
    });
});
