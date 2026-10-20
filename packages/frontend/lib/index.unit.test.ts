import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Nango from './index.js';

const host = 'https://api.nango.dev';
const connectSessionToken = 'nango_connect_session_test';

describe('Nango.auth with credentials', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ providerConfigKey: 'test', connectionId: 'conn' })
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function lastRequest() {
        const [url, init] = fetchMock.mock.calls[0] as [string, { body?: string }];
        return { url: new URL(url), body: init.body ? JSON.parse(init.body) : undefined };
    }

    it('should send TWO_STEP credentials to the two-step endpoint even when they contain client_id and client_secret', async () => {
        const nango = new Nango({ host, connectSessionToken });

        await nango.auth('netsapiens', {
            params: { server: 'core.example.com' },
            credentials: {
                type: 'TWO_STEP',
                client_id: 'my-client-id',
                client_secret: 'my-client-secret',
                username: 'api-user',
                password: 'api-password'
            }
        });

        const { url, body } = lastRequest();
        expect(url.pathname).toBe('/auth/two-step/netsapiens');
        expect(url.searchParams.get('params[server]')).toBe('core.example.com');
        expect(body).toStrictEqual({
            type: 'TWO_STEP',
            client_id: 'my-client-id',
            client_secret: 'my-client-secret',
            username: 'api-user',
            password: 'api-password'
        });
    });

    it('should keep sending untyped client_id/client_secret credentials to the OAuth2 client credentials endpoint', async () => {
        const nango = new Nango({ host, connectSessionToken });

        await nango.auth('oauth2-cc-provider', {
            credentials: {
                client_id: 'my-client-id',
                client_secret: 'my-client-secret'
            }
        });

        const { url, body } = lastRequest();
        expect(url.pathname).toBe('/oauth2/auth/oauth2-cc-provider');
        expect(body).toStrictEqual({
            client_id: 'my-client-id',
            client_secret: 'my-client-secret'
        });
    });

    it('should preserve special characters in authorization parameter names and values', async () => {
        const nango = new Nango({ host, connectSessionToken });

        await nango.auth('oauth2-cc-provider', {
            credentials: { client_id: 'my-client-id', client_secret: 'my-client-secret' },
            authorization_params: {
                'custom&key': 'consent&scope=admin+read#fragment',
                prompt: undefined
            }
        });

        const { url } = lastRequest();
        expect(url.searchParams.get('authorization_params[custom&key]')).toBe('consent&scope=admin+read#fragment');
        expect(url.searchParams.get('authorization_params[prompt]')).toBe('undefined');
        expect(url.searchParams.has('scope')).toBe(false);
    });
});
