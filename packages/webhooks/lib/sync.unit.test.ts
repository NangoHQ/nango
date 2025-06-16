/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance } from '@nangohq/utils';

import { sendSync } from './sync.js';

import type { ConnectionJobs, DBEnvironment, DBExternalWebhook, DBSyncConfig, DBTeam, IntegrationConfig, NangoSyncWebhookBodySuccess } from '@nangohq/types';

const spy = vi.spyOn(axiosInstance, 'post');

const account: DBTeam = {
    id: 1,
    name: 'team',
    uuid: 'uuid',
    created_at: new Date(),
    updated_at: new Date()
};

const providerConfig: IntegrationConfig = {
    id: 1,
    display_name: null,
    provider: 'provider',
    unique_key: 'unique_key',
    oauth_client_id: '',
    oauth_client_secret: '',
    environment_id: 1,
    missing_fields: [],
    created_at: new Date(),
    updated_at: new Date(),
    forward_webhooks: true
};

const syncConfig: DBSyncConfig = {
    id: 1,
    sync_name: 'a_sync',
    nango_config_id: 1,
    file_location: 'file_location',
    version: '0.0.1',
    models: [], // TODO: remove nullable NAN-2527
    active: true,
    runs: null,
    environment_id: 1,
    track_deletes: true,
    type: 'sync',
    auto_start: false,
    attributes: {},
    pre_built: true,
    is_public: false,
    metadata: {},
    model_schema: null,
    input: null,
    sync_type: 'full',
    webhook_subscriptions: null,
    enabled: true,
    models_json_schema: null,
    sdk_version: null,
    created_at: new Date(),
    updated_at: new Date()
};

const connection: ConnectionJobs = {
    id: 1,
    connection_id: '1',
    provider_config_key: 'providerkey',
    environment_id: 1
};

const webhookSettings: DBExternalWebhook = {
    id: 1,
    environment_id: 1,
    primary_url: 'http://example.com/webhook',
    secondary_url: 'http://example.com/webhook-secondary',
    on_sync_completion_always: true,
    on_auth_creation: true,
    on_auth_refresh_error: true,
    on_sync_error: true,
    on_async_action_completion: true,
    created_at: new Date(),
    updated_at: new Date()
};

describe('Webhooks: sync notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send a sync webhook if the webhook url is not present', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };

        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            webhookSettings: {
                ...webhookSettings,
                primary_url: '',
                secondary_url: '',
                on_sync_completion_always: false
            },
            model: 'model',
            responseResults,
            success: true,
            operation: 'INCREMENTAL',
            now: new Date()
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present even if always send is checked', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            success: true,
            operation: 'INCREMENTAL',
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                primary_url: '',
                secondary_url: '',
                on_sync_completion_always: true
            }
        });
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is present but if always send is not checked and there were no sync changes', async () => {
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            success: true,
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: false
            }
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is not checked and there were sync changes', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            success: true,
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: false
            }
        });
        expect(spy).toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is checked and there were sync changes', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            success: true,
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: true
            }
        });
        expect(spy).toHaveBeenCalled();
    });

    it('Should send an sync webhook if the webhook url is present and if always send is checked and there were no sync changes', async () => {
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now: new Date(),
            success: true,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: true
            }
        });
        expect(spy).toHaveBeenCalled();
    });

    it('Should send an sync webhook twice if the webhook url and secondary are present and if always send is checked and there were no sync changes', async () => {
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now: new Date(),
            success: true,
            webhookSettings: {
                ...webhookSettings,
                on_sync_completion_always: true
            }
        });
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('Should send a webhook with the correct body on sync success', async () => {
        const now = new Date();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now,
            success: true,
            webhookSettings: webhookSettings
        });

        const body: NangoSyncWebhookBodySuccess = {
            from: 'nango',
            type: 'sync',
            modifiedAfter: now.toISOString(),
            model: 'model',
            queryTimeStamp: now as unknown as string,
            responseResults,
            connectionId: connection.connection_id,
            syncName: 'a_sync',
            syncVariant: 'base',
            providerConfigKey: connection.provider_config_key,
            success: true,
            syncType: 'INCREMENTAL'
        };
        expect(spy).toHaveBeenCalledTimes(2);

        expect(spy).toHaveBeenNthCalledWith(
            1,
            'http://example.com/webhook',
            expect.objectContaining(body),
            expect.objectContaining({
                headers: {
                    'X-Nango-Signature': expect.toBeSha256()
                }
            })
        );

        expect(spy).toHaveBeenNthCalledWith(
            2,
            'http://example.com/webhook-secondary',
            expect.objectContaining(body),
            expect.objectContaining({
                headers: {
                    'X-Nango-Signature': expect.toBeSha256()
                }
            })
        );
    });

    it('Should not send an error webhook if the option is not checked', async () => {
        const error = {
            type: 'error',
            description: 'error description'
        };

        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            success: false,
            error,
            operation: 'INCREMENTAL',
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                on_sync_error: false
            }
        });

        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send an error webhook if the option is checked with the correct body', async () => {
        const error = {
            type: 'error',
            description: 'error description'
        };

        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as DBEnvironment,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            success: false,
            error,
            operation: 'INCREMENTAL',
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                on_sync_error: true
            }
        });

        expect(spy).toHaveBeenCalled();
    });
});
