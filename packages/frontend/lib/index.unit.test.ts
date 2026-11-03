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

    it('should send GitHub App credentials through the popup flow (not the custom auth endpoints)', async () => {
        const open = vi.fn().mockReturnValue(null);
        vi.stubGlobal('window', { open, screen: { width: 1200, height: 800 } });
        const nango = new Nango({ host, connectSessionToken });

        await expect(
            nango.auth('github-app', {
                credentials: {
                    app_id: '12345',
                    private_key: '-----BEGIN RSA PRIVATE KEY-----a+b/c=-----END RSA PRIVATE KEY-----',
                    app_link: 'https://github.com/apps/my-app',
                    webhook_secret: 'my-webhook-secret'
                }
            })
        ).rejects.toMatchObject({ type: 'blocked_by_browser' });

        expect(open).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should put GitHub App credentials in the popup url query', () => {
        const nango = new Nango({ host, connectSessionToken });
        const privateKey = '-----BEGIN RSA PRIVATE KEY-----a+b/c=-----END RSA PRIVATE KEY-----';

        const query = (nango as unknown as { toQueryString: (connectionId: string | null, config: unknown) => string }).toQueryString(null, {
            credentials: { app_id: '12345', private_key: privateKey, app_link: 'https://github.com/apps/my-app', webhook_secret: 'my-webhook-secret' }
        });
        const params = new URLSearchParams(query.slice(1));

        expect(params.get('credentials[app_id]')).toBe('12345');
        expect(params.get('credentials[private_key]')).toBe(privateKey);
        expect(params.get('credentials[app_link]')).toBe('https://github.com/apps/my-app');
        expect(params.get('credentials[webhook_secret]')).toBe('my-webhook-secret');
    });
});
