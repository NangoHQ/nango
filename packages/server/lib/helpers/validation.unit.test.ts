import { describe, expect, it } from 'vitest';

import { connectionCredentialsOauth2CCSchema } from './validation.js';

// The previous cap that wrongly rejected long OAUTH2_CC tokens on import (#6239).
const OLD_MAX_TOKEN_LENGTH = 2048;
// The current cap, matched to the OAUTH2 `access_token` limit.
const MAX_TOKEN_LENGTH = 4096;

describe('connectionCredentialsOauth2CCSchema', () => {
    const baseCredentials = {
        token: 'a',
        client_id: 'client-id',
        client_secret: 'client-secret'
    };

    it('accepts a token longer than the old cap (regression for #6239)', () => {
        // Microsoft Entra OAUTH2_CC access tokens are JWTs that routinely land in the
        // 2050-2200 char range, which the previous OLD_MAX_TOKEN_LENGTH cap wrongly
        // rejected on import. Just over the old cap is enough to prove the regression.
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: 'a'.repeat(OLD_MAX_TOKEN_LENGTH + 1)
        });

        expect(res.success).toBe(true);
    });

    it('accepts a token up to the max length', () => {
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: 'a'.repeat(MAX_TOKEN_LENGTH)
        });

        expect(res.success).toBe(true);
    });

    it('rejects a token longer than the max length', () => {
        const res = connectionCredentialsOauth2CCSchema.safeParse({
            ...baseCredentials,
            token: 'a'.repeat(MAX_TOKEN_LENGTH + 1)
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
