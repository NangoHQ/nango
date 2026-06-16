import { describe, expect, it } from 'vitest';

import { resolveImpersonationRole } from './impersonation.js';

describe('resolveImpersonationRole', () => {
    it('forces the override role on an impersonation session', () => {
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: true, override: 'production_support' })).toBe('production_support');
    });

    it('keeps the real role when the override is not configured', () => {
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: true, override: undefined })).toBe('administrator');
    });

    it('keeps the real role for non-impersonation sessions even when the override is configured', () => {
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: undefined, override: 'production_support' })).toBe('administrator');
        expect(resolveImpersonationRole({ role: 'administrator', debugMode: false, override: 'production_support' })).toBe('administrator');
    });
});
