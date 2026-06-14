import { describe, expect, it } from 'vitest';

import { connectionCredentialsOauth2CCSchema } from './validation.js';

describe('connectionCredentialsOauth2CCSchema', () => {
    const baseCredentials = {
        token: 'a',
        client_id: 'client-id',
        client_secret: 'client-secret'
    };

    it('accepts a token longer than 2048 chars (regression for #6239)', () => {
        // Microsoft Entra OAUTH2_CC access tokens are JWTs that routinely land in the
        // 2050-2200 char range, which the previous 2048 cap wrongly rejected on import.
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: 'a'.repeat(2099)
        });

        expect(res.success).toBe(true);
    });

    it('accepts a token up to 4096 chars', () => {
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: 'a'.repeat(4096)
        });

        expect(res.success).toBe(true);
    });

    it('rejects a token longer than 4096 chars', () => {
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: 'a'.repeat(4097)
        });

        expect(res.success).toBe(false);
    });

    it('rejects an empty token', () => {
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: ''
        });

        expect(res.success).toBe(false);
    });
});
