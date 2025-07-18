import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getExpiresAtFromCredentials } from './utils.js';

import type { AllAuthCredentials } from '@nangohq/types';

describe('getExpiresAtFromCredentials', () => {
    const now = new Date('2025-07-18T12:00:00.000Z').getTime();

    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });

    it('returns earliest of app and user expires_at for CUSTOM type', () => {
        const credentials = {
            type: 'CUSTOM',
            raw: {},
            app: { type: 'APP', access_token: 'app_token', raw: {}, expires_at: new Date('2025-07-20T10:00:00Z').toISOString() },
            user: { type: 'OAUTH2', access_token: 'user_token', raw: {}, expires_at: new Date('2025-07-18T10:00:00Z').toISOString() }
        } as AllAuthCredentials;

        const result = getExpiresAtFromCredentials(credentials);
        expect(result?.toISOString()).toBe('2025-07-18T10:00:00.000Z');
    });

    it('returns app expires_at if user expires_at is missing', () => {
        const credentials = {
            type: 'CUSTOM',
            raw: {},
            app: { type: 'APP', access_token: 'app_token', raw: {}, expires_at: new Date('2025-07-20T10:00:00Z').toISOString() }
        } as AllAuthCredentials;

        const result = getExpiresAtFromCredentials(credentials);
        expect(result?.toISOString()).toBe('2025-07-20T10:00:00.000Z');
    });

    it('returns app expires_at when it expires earlier than user', () => {
        const credentials = {
            type: 'CUSTOM',
            raw: {},
            app: { type: 'APP', access_token: 'app_token', raw: {}, expires_at: new Date('2025-07-18T09:00:00Z').toISOString() },
            user: { type: 'OAUTH2', access_token: 'user_token', raw: {}, expires_at: new Date('2025-07-20T10:00:00Z').toISOString() }
        } as AllAuthCredentials;

        const result = getExpiresAtFromCredentials(credentials);
        expect(result?.toISOString()).toBe('2025-07-18T09:00:00.000Z');
    });

    it('returns top-level for Oauth2 expires_at if present', () => {
        const credentials = {
            type: 'OAUTH2',
            access_token: 'token',
            expires_in: 3599,
            scope: 'scope',
            token_type: 'Bearer',
            raw: {},
            expires_at: new Date('2025-07-18T10:44:33.261Z')
        } as AllAuthCredentials;

        const result = getExpiresAtFromCredentials(credentials);
        expect(result?.toISOString()).toBe('2025-07-18T10:44:33.261Z');
    });
});
