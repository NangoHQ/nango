// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { isNoSessionError } from './api.js';

vi.hoisted(() => {
    // utils/api imports utils/env, which reads the /env.js snapshot as it loads.
    vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003' });
});

describe('isNoSessionError', () => {
    it('matches the 401 sent when there is no session', () => {
        expect(isNoSessionError(401, { error: { code: 'unauthorized' } })).toBe(true);
    });

    it('ignores 401s sent with a live session', () => {
        expect(isNoSessionError(401, { error: { code: 'unknown_account_or_env' } })).toBe(false);
        expect(isNoSessionError(401, { error: { code: 'invalid_env' } })).toBe(false);
        expect(isNoSessionError(401, { error: { code: 'plan_not_found' } })).toBe(false);
        expect(isNoSessionError(401, { error: { code: 'forbidden' } })).toBe(false);
    });

    it('ignores other statuses and bodies without an error code', () => {
        expect(isNoSessionError(403, { error: { code: 'unauthorized' } })).toBe(false);
        expect(isNoSessionError(401, {})).toBe(false);
        expect(isNoSessionError(401, null)).toBe(false);
        expect(isNoSessionError(401, 'Unauthorized')).toBe(false);
    });
});
