import { describe, expect, it } from 'vitest';

import { connectionSimpleToPublicApi, redactCredentials } from './connection.js';

import type { DBConnectionAsJSONRow, DBEndUser } from '@nangohq/types';

describe('redactCredentials', () => {
    it('keeps type and redacts secret fields for ApiKeyCredentials', () => {
        const result = redactCredentials({ type: 'API_KEY', apiKey: 'secret-key' });
        expect(result).toEqual({ type: 'API_KEY', apiKey: 'REDACTED' });
    });

    it('keeps type and redacts secret fields for BasicApiCredentials', () => {
        const result = redactCredentials({ type: 'BASIC', username: 'user', password: 'pass' });
        expect(result).toEqual({ type: 'BASIC', username: 'REDACTED', password: 'REDACTED' });
    });

    it('keeps type and expires_at, redacts tokens and raw for OAuth2Credentials', () => {
        const expiresAt = new Date('2025-01-01');
        const result = redactCredentials({
            type: 'OAUTH2',
            access_token: 'at',
            refresh_token: 'rt',
            expires_at: expiresAt,
            raw: { access_token: 'at', expires_in: 3600 }
        });
        expect(result).toEqual({
            type: 'OAUTH2',
            access_token: 'REDACTED',
            refresh_token: 'REDACTED',
            expires_at: expiresAt,
            raw: { access_token: 'REDACTED', expires_in: 'REDACTED' }
        });
    });

    it('redacts nested config_override for OAuth2ClientCredentials', () => {
        const result = redactCredentials({
            type: 'OAUTH2_CC',
            token: 'tok',
            client_id: 'cid',
            client_secret: 'csecret',
            client_certificate: 'cert',
            raw: {}
        });
        expect(result).toEqual({
            type: 'OAUTH2_CC',
            token: 'REDACTED',
            client_id: 'REDACTED',
            client_secret: 'REDACTED',
            client_certificate: 'REDACTED',
            raw: {}
        });
    });

    it('redacts TbaCredentials including nested config_override', () => {
        const result = redactCredentials({
            type: 'TBA',
            token_id: 'tid',
            token_secret: 'tsecret',
            config_override: { client_id: 'cid', client_secret: 'csecret' }
        });
        expect(result).toEqual({
            type: 'TBA',
            token_id: 'REDACTED',
            token_secret: 'REDACTED',
            config_override: { client_id: 'REDACTED', client_secret: 'REDACTED' }
        });
    });

    it('redacts deeply nested objects for CombinedOauth2AppCredentials', () => {
        const expiresAt = new Date('2025-01-01');
        const result = redactCredentials({
            type: 'CUSTOM',
            app: { type: 'APP', access_token: 'at', raw: { token: 'raw_token' } },
            user: { type: 'OAUTH2', access_token: 'uat', expires_at: expiresAt, raw: {} },
            raw: {}
        });
        expect(result).toEqual({
            type: 'CUSTOM',
            app: { type: 'APP', access_token: 'REDACTED', raw: { token: 'REDACTED' } },
            user: { type: 'OAUTH2', access_token: 'REDACTED', expires_at: expiresAt, raw: {} },
            raw: {}
        });
    });

    it('passes through null and undefined values', () => {
        const result = redactCredentials({
            type: 'OAUTH2',
            access_token: 'at',
            refresh_token: undefined,
            expires_at: undefined,
            raw: { scope: null }
        });
        expect(result).toMatchObject({
            type: 'OAUTH2',
            access_token: 'REDACTED',
            refresh_token: undefined,
            raw: { scope: null }
        });
    });

    it('handles arrays inside raw', () => {
        const result = redactCredentials({
            type: 'OAUTH2',
            access_token: 'at',
            raw: { scopes: ['read', 'write'] }
        });
        expect(result).toEqual({
            type: 'OAUTH2',
            access_token: 'REDACTED',
            raw: { scopes: ['REDACTED', 'REDACTED'] }
        });
    });

    it('handles empty UnauthCredentials', () => {
        const result = redactCredentials({} as any);
        expect(result).toEqual({});
    });
});

describe('connectionSimpleToPublicApi', () => {
    it('formats the shared service result without exposing credentials', () => {
        const result = connectionSimpleToPublicApi({
            data: connectionFixture(),
            provider: 'github',
            activeLog: [{ type: 'auth', log_id: 'log-id' }],
            endUser: endUserFixture()
        });

        expect(result).toStrictEqual({
            id: 1,
            connection_id: 'connection-id',
            provider_config_key: 'github',
            provider: 'github',
            created: '2026-01-01T00:00:00.000+00:00',
            metadata: { tenant: 'acme' },
            tags: { team: 'platform' },
            errors: [{ type: 'auth', log_id: 'log-id' }],
            end_user: {
                id: 'end-user-id',
                display_name: 'End User',
                email: 'end-user@example.com',
                tags: { tier: 'enterprise' },
                organization: { id: 'organization-id', display_name: 'Acme' }
            }
        });
        expect(result).not.toHaveProperty('credentials');
    });
});

function connectionFixture(): DBConnectionAsJSONRow {
    return {
        id: 1,
        config_id: 2,
        end_user_id: 3,
        provider_config_key: 'github',
        connection_id: 'connection-id',
        connection_config: {},
        webhook_url_override: null,
        environment_id: 42,
        metadata: { tenant: 'acme' },
        tags: { team: 'platform' },
        credentials: { type: 'API_KEY', apiKey: 'secret' } as unknown as DBConnectionAsJSONRow['credentials'],
        credentials_iv: null,
        credentials_tag: null,
        last_fetched_at: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        created_at: '2026-01-01T00:00:00.000+00:00',
        updated_at: '2026-01-02T00:00:00.000+00:00',
        deleted: false,
        deleted_at: null
    };
}

function endUserFixture(): DBEndUser {
    return {
        id: 3,
        end_user_id: 'end-user-id',
        account_id: 4,
        environment_id: 42,
        email: 'end-user@example.com',
        display_name: 'End User',
        organization_id: 'organization-id',
        organization_display_name: 'Acme',
        tags: { tier: 'enterprise' },
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: null
    };
}
