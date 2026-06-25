import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { sendAuth } from './auth.js';
import { deliver } from './utils.js';

import type { DBAPISecret, DBConnection, DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig, Tags } from '@nangohq/types';

vi.mock('./utils.js', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, deliver: vi.fn() };
});

const deliverMock = vi.mocked(deliver);

const primaryUrl = 'https://example.com/webhook';
const secondaryUrl = 'https://example.com/webhook-secondary';

const account: DBTeam = {
    id: 1,
    name: 'account',
    uuid: 'uuid',
    found_us: '',
    created_at: new Date(),
    updated_at: new Date()
};

const connection: Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key'> = {
    id: 1,
    connection_id: '1',
    provider_config_key: 'providerkey'
};

const webhookSettings: DBExternalWebhook = {
    id: 1,
    environment_id: 1,
    primary_url: primaryUrl,
    secondary_url: secondaryUrl,
    on_sync_completion_always: true,
    on_auth_creation: true,
    on_auth_refresh_error: true,
    on_sync_error: true,
    on_async_action_completion: true,
    created_at: new Date(),
    updated_at: new Date()
};

const providerConfig = {
    id: 1,
    unique_key: 'hubspot',
    provider: 'hubspot'
} as IntegrationConfig;

const secret = 'secret' as DBAPISecret['secret'];

describe('Webhooks: auth notification tests', () => {
    beforeEach(() => {
        deliverMock.mockReset();
        deliverMock.mockResolvedValue(Ok(undefined));
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                primary_url: '',
                secondary_url: '',
                on_auth_creation: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should deliver to the primary webhook url when only the primary is present', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_auth_creation: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([{ url: primaryUrl, type: 'webhook url' }]);
    });

    it('Should deliver to the secondary webhook url when only the secondary is present', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                always_send_webhook: true
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: true,
                primary_url: ''
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([{ url: secondaryUrl, type: 'secondary webhook url' }]);
    });

    it('Should deliver to both webhook urls in a single deliver call when both are present', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([
            { url: primaryUrl, type: 'webhook url' },
            { url: secondaryUrl, type: 'secondary webhook url' }
        ]);
    });

    it('Should send an auth webhook if the webhook url is present and if the auth webhook is checked and the operation failed', async () => {
        await sendAuth({
            connection,
            success: false,
            error: {
                type: 'error',
                description: 'error description'
            },
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_auth_creation: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].body).toMatchObject({
            type: 'auth',
            success: false,
            error: { type: 'error', description: 'error description' }
        });
    });

    it('Should not send an auth webhook if the webhook url is present and if the auth webhook is not checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: false
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should not send an auth webhook if on refresh error is checked but there is no webhook url', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                primary_url: '',
                secondary_url: '',
                on_auth_creation: true,
                on_auth_refresh_error: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'refresh'
        });
        // No webhook urls => shouldSend short-circuits and deliver is never invoked.
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if on refresh error is checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_auth_creation: true,
                on_auth_refresh_error: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'refresh'
        });
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([{ url: primaryUrl, type: 'webhook url' }]);
    });

    it('Should not send an auth webhook if on refresh error is not checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: true,
                on_auth_refresh_error: false
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'refresh'
        });

        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should deliver to both urls with the correct body on refresh error', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: false,
                on_auth_refresh_error: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'refresh'
        });

        expect(deliverMock).toHaveBeenCalledTimes(1);
        const args = deliverMock.mock.calls[0]![0];
        expect(args.webhookType).toBe('auth');
        expect(args.webhooks).toEqual([
            { url: primaryUrl, type: 'webhook url' },
            { url: secondaryUrl, type: 'secondary webhook url' }
        ]);
        expect(args.body).toMatchObject({
            from: 'nango',
            type: 'auth',
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            authMode: 'OAUTH2',
            provider: 'hubspot',
            environment: 'dev',
            success: true,
            operation: 'refresh'
        });
    });

    describe('tags', () => {
        it('Should include connection tags in webhook body', async () => {
            const tags: Tags = { department: 'engineering', priority: 'high' };
            const connectionWithTags = {
                ...connection,
                tags
            };

            await sendAuth({
                connection: connectionWithTags,
                success: true,
                environment: {
                    name: 'dev',
                    id: 1
                } as DBEnvironment,
                secret,
                webhookSettings: {
                    ...webhookSettings,
                    secondary_url: '',
                    on_auth_creation: true
                },
                providerConfig,
                account,
                auth_mode: 'OAUTH2',
                operation: 'creation'
            });

            expect(deliverMock).toHaveBeenCalledTimes(1);
            expect(deliverMock.mock.calls[0]![0].body).toMatchObject({
                tags: { department: 'engineering', priority: 'high' }
            });
        });

        it('Should not include tags when connection has no tags', async () => {
            await sendAuth({
                connection,
                success: true,
                environment: {
                    name: 'dev',
                    id: 1
                } as DBEnvironment,
                secret,
                webhookSettings: {
                    ...webhookSettings,
                    secondary_url: '',
                    on_auth_creation: true
                },
                providerConfig,
                account,
                auth_mode: 'OAUTH2',
                operation: 'creation'
            });

            expect(deliverMock).toHaveBeenCalledTimes(1);
            expect((deliverMock.mock.calls[0]![0].body as Record<string, unknown>)['tags']).toBeUndefined();
        });
    });
});
