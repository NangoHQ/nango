import { afterEach, describe, expect, it, vi } from 'vitest';

import { chooseMcpClientIdMethod, refreshMcpGenericCredentials } from './mcpGeneric.client.js';

import type { LogContextStateless } from '@nangohq/logs';
import type { DBConnectionDecrypted, OAuth2Credentials } from '@nangohq/types';

const cimdUrl = 'https://api.example.com/oauth/client-metadata/env-uuid/my-integration';

const oauthMetadata = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/oauth/token',
    response_types_supported: ['code'],
    token_endpoint_auth_methods_supported: ['none']
};

const publicClientInfo = {
    client_id: 'public-client-id',
    token_endpoint_auth_method: 'none'
};

function mockLogCtx(): LogContextStateless {
    return { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as LogContextStateless;
}

function mcpGenericConnection(overrides?: {
    clientInfo?: Record<string, unknown>;
    credentials?: Partial<OAuth2Credentials>;
    resourceUrl?: string;
}): DBConnectionDecrypted {
    return {
        connection_id: 'a',
        created_at: new Date(),
        end_user_id: null,
        environment_id: 1,
        provider_config_key: 'mcp-generic',
        updated_at: new Date(),
        webhook_url_override: null,
        config_id: 1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        id: -1,
        last_fetched_at: null,
        metadata: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        tags: {},
        connection_config: {
            oauth_metadata: JSON.stringify(oauthMetadata),
            oauth_client_info: JSON.stringify(overrides?.clientInfo ?? publicClientInfo),
            oauth_resource_url: overrides?.resourceUrl ?? 'https://mcp.example.com/',
            mcp_server_url: 'https://mcp.example.com/mcp'
        },
        credentials: {
            type: 'OAUTH2',
            access_token: 'old-access',
            refresh_token: 'refresh-token',
            expires_at: new Date(Date.now() - 1000),
            raw: {},
            ...overrides?.credentials
        }
    };
}

describe('chooseMcpClientIdMethod', () => {
    it('prefers CIMD when the server advertises support and a document url is available', () => {
        expect(chooseMcpClientIdMethod({ client_id_metadata_document_supported: true }, cimdUrl)).toBe('cimd');
    });

    it('prefers CIMD over DCR when both are available', () => {
        expect(
            chooseMcpClientIdMethod({ client_id_metadata_document_supported: true, registration_endpoint: 'https://mcp.example.com/register' }, cimdUrl)
        ).toBe('cimd');
    });

    it('falls back to DCR when no document url is available', () => {
        expect(chooseMcpClientIdMethod({ client_id_metadata_document_supported: true, registration_endpoint: 'https://mcp.example.com/register' }, null)).toBe(
            'dcr'
        );
    });

    it('uses DCR when the server does not advertise CIMD support', () => {
        expect(chooseMcpClientIdMethod({ registration_endpoint: 'https://mcp.example.com/register' }, cimdUrl)).toBe('dcr');
    });

    it('ignores a non-boolean-true CIMD flag', () => {
        expect(
            chooseMcpClientIdMethod({ client_id_metadata_document_supported: false, registration_endpoint: 'https://mcp.example.com/register' }, cimdUrl)
        ).toBe('dcr');
    });

    it('falls back to static when neither CIMD nor DCR is available', () => {
        expect(chooseMcpClientIdMethod({}, null)).toBe('static');
        expect(chooseMcpClientIdMethod({ client_id_metadata_document_supported: true }, null)).toBe('static');
    });
});

describe('refreshMcpGenericCredentials', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('refreshes without sending client_secret for public clients', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'new-refresh' }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await refreshMcpGenericCredentials({
            connection: mcpGenericConnection(),
            logCtx: mockLogCtx()
        });

        expect(result.success).toBe(true);
        expect(result.response?.access_token).toBe('new-access');
        expect(result.response?.refresh_token).toBe('new-refresh');
        expect(result.response?.expires_at).toBeInstanceOf(Date);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(String(url)).toBe('https://auth.example.com/oauth/token');
        expect(init?.method).toBe('POST');

        const body = new URLSearchParams(init?.body as string);
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('refresh-token');
        expect(body.get('client_id')).toBe('public-client-id');
        expect(body.get('resource')).toBe('https://mcp.example.com/');
        expect(body.has('client_secret')).toBe(false);
    });

    it('preserves the existing refresh token when the server does not return a new one', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                })
            )
        );

        const result = await refreshMcpGenericCredentials({
            connection: mcpGenericConnection(),
            logCtx: mockLogCtx()
        });

        expect(result.success).toBe(true);
        expect(result.response?.refresh_token).toBe('refresh-token');
    });

    it('returns refresh_token_external_error when the token endpoint rejects the request', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ error: 'invalid_request', error_description: 'client_secret: missing_required_field' }), {
                    status: 400,
                    headers: { 'content-type': 'application/json' }
                })
            )
        );

        const result = await refreshMcpGenericCredentials({
            connection: mcpGenericConnection(),
            logCtx: mockLogCtx()
        });

        expect(result.success).toBe(false);
        expect(result.error?.type).toBe('refresh_token_external_error');
    });

    it('returns invalid_oauth_metadata when oauth_resource_url is malformed', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await refreshMcpGenericCredentials({
            connection: mcpGenericConnection({ resourceUrl: 'not a url' }),
            logCtx: mockLogCtx()
        });

        expect(result.success).toBe(false);
        expect(result.error?.type).toBe('unhandled_invalid_oauth_metadata');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
