/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { sendSync } from './sync.js';
import { axiosInstance } from '@nangohq/utils';
import type { NangoSyncWebhookBodySuccess, Connection, ExternalWebhook, DBEnvironment, DBTeam, DBSyncConfig, IntegrationConfig } from '@nangohq/types';

const spy = vi.spyOn(axiosInstance, 'post');

const account: DBTeam = {
    id: 1,
    name: 'team',
    uuid: 'uuid',
    is_capped: false,
    created_at: new Date(),
    updated_at: new Date()
};

const providerConfig: IntegrationConfig = {
    id: 1,
    provider: 'provider',
    unique_key: 'unique_key',
    oauth_client_id: '',
    oauth_client_secret: '',
    environment_id: 1,
    missing_fields: [],
    created_at: new Date(),
    updated_at: new Date()
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
    model_schema: null,
    environment_id: 1,
    track_deletes: true,
    type: 'sync',
    auto_start: false,
    attributes: {},
    pre_built: true,
    is_public: false,
    metadata: {},
    input: null,
    sync_type: 'full',
    webhook_subscriptions: null,
    enabled: true,
    models_json_schema: null,
    created_at: new Date(),
    updated_at: new Date()
};

const connection: Pick<Connection, 'id' | 'connection_id' | 'provider_config_key'> = {
    id: 1,
    connection_id: '1',
    provider_config_key: 'providerkey'
};

const webhookSettings: ExternalWebhook = {
    id: 1,
    environment_id: 1,
    primary_url: 'http://example.com/webhook',
    secondary_url: 'http://example.com/webhook-secondary',
    on_sync_completion_always: true,
    on_auth_creation: true,
    on_auth_refresh_error: true,
    on_sync_error: true,
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
