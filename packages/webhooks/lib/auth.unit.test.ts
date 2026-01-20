import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance, stringifyStable } from '@nangohq/utils';

import { sendAuth } from './auth.js';
import { TestWebhookServer } from './helpers/test.js';

import type { DBConnection, DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig, NangoAuthWebhookBodySuccess, Tags } from '@nangohq/types';

const spy = vi.spyOn(axiosInstance, 'post');

const testServer = new TestWebhookServer(4101);

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
    primary_url: testServer.primaryUrl,
    secondary_url: testServer.secondaryUrl,
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

describe('Webhooks: auth notification tests', () => {
    beforeAll(async () => {
        await testServer.start();
    });

    afterAll(async () => {
        await testServer.stop();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if the primary webhook url is present but the secondary is not', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send an auth webhook if the webhook url is not present but the secondary is', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                always_send_webhook: true
            } as DBEnvironment,
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
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send an auth webhook twice if the webhook url is present and the secondary is as well', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: true
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(spy).toHaveBeenCalledTimes(2);
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
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should not send an auth webhook if the webhook url is present and if the auth webhook is not checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
            webhookSettings: {
                ...webhookSettings,
                on_auth_creation: false
            },
            providerConfig,
            account,
            auth_mode: 'OAUTH2',
            operation: 'creation'
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should not send an auth webhook if on refresh error is checked but there is no webhook url', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if on refresh error is checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should not send an auth webhook if on refresh error is not checked', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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

        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook twice if on refresh error is checked and there are two webhook urls with the correct body', async () => {
        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
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

        expect(spy).toHaveBeenCalledTimes(2);

        const body: NangoAuthWebhookBodySuccess = {
            from: 'nango',
            type: 'auth',
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            authMode: 'OAUTH2',
            provider: 'hubspot',
            environment: 'dev',
            success: true,
            operation: 'refresh'
        };
        const bodyString = stringifyStable(body).unwrap();

        expect(spy).toHaveBeenNthCalledWith(
            1,
            webhookSettings.primary_url,
            bodyString,
            expect.objectContaining({
                headers: {
                    'X-Nango-Signature': expect.toBeSha256(),
                    'X-Nango-Hmac-Sha256': expect.toBeSha256(),
                    'content-type': 'application/json',
                    'user-agent': expect.stringContaining('nango/')
                }
            })
        );

        expect(spy).toHaveBeenNthCalledWith(
            2,
            webhookSettings.secondary_url,
            bodyString,
            expect.objectContaining({
                headers: {
                    'X-Nango-Signature': expect.toBeSha256(),
                    'X-Nango-Hmac-Sha256': expect.toBeSha256(),
                    'content-type': 'application/json',
                    'user-agent': expect.stringContaining('nango/')
                }
            })
        );
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
                    id: 1,
                    secret_key: 'secret'
                } as DBEnvironment,
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

            expect(spy).toHaveBeenCalledTimes(1);

            const body: NangoAuthWebhookBodySuccess = {
                from: 'nango',
                type: 'auth',
                connectionId: connection.connection_id,
                providerConfigKey: connection.provider_config_key,
                authMode: 'OAUTH2',
                provider: 'hubspot',
                environment: 'dev',
                success: true,
                operation: 'creation',
                tags: { department: 'engineering', priority: 'high' }
            };
            const bodyString = stringifyStable(body).unwrap();

            expect(spy).toHaveBeenCalledWith(
                webhookSettings.primary_url,
                bodyString,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'content-type': 'application/json'
                    })
                })
            );
        });

        it('Should not include tags when connection has no tags', async () => {
            await sendAuth({
                connection,
                success: true,
                environment: {
                    name: 'dev',
                    id: 1,
                    secret_key: 'secret'
                } as DBEnvironment,
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

            expect(spy).toHaveBeenCalledTimes(1);

            const body: NangoAuthWebhookBodySuccess = {
                from: 'nango',
                type: 'auth',
                connectionId: connection.connection_id,
                providerConfigKey: connection.provider_config_key,
                authMode: 'OAUTH2',
                provider: 'hubspot',
                environment: 'dev',
                success: true,
                operation: 'creation'
            };
            const bodyString = stringifyStable(body).unwrap();

            expect(spy).toHaveBeenCalledWith(
                webhookSettings.primary_url,
                bodyString,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'content-type': 'application/json'
                    })
                })
            );
        });
    });
});
