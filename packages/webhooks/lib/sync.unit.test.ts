import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { sendSync } from './sync.js';
import { deliver } from './utils.js';

import type { ConnectionJobs, DBAPISecret, DBEnvironment, DBExternalWebhook, DBSyncConfig, DBTeam, IntegrationConfig } from '@nangohq/types';

const shouldSendSyncCompletedWebhook = vi.fn().mockResolvedValue(true);

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({
        shouldSendSyncCompletedWebhook
    })
}));

vi.mock('./utils.js', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, deliver: vi.fn() };
});

const deliverMock = vi.mocked(deliver);

const primaryUrl = 'https://example.com/webhook';
const secondaryUrl = 'https://example.com/webhook-secondary';

const account: DBTeam = {
    id: 1,
    name: 'team',
    uuid: 'uuid',
    found_us: '',
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
    forward_webhooks: true,
    shared_credentials_id: null
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
    source: 'catalog',
    metadata: {},
    model_schema: null,
    input: null,
    sync_type: 'full',
    webhook_subscriptions: null,
    enabled: true,
    models_json_schema: null,
    sdk_version: null,
    features: [],
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

const secret = 'secret' as DBAPISecret['secret'];

describe('Webhooks: sync notification tests', () => {
    beforeEach(() => {
        deliverMock.mockReset();
        deliverMock.mockResolvedValue(Ok(undefined));
        shouldSendSyncCompletedWebhook.mockReset();
        shouldSendSyncCompletedWebhook.mockResolvedValue(true);
    });

    it('Should not send a sync webhook if the webhook url is not present', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };

        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present even if always send is checked', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is present but if always send is not checked and there were no sync changes', async () => {
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is not checked and there were sync changes', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).toHaveBeenCalledTimes(1);
    });

    it('Should send a sync webhook if the webhook url is present and if always send is checked and there were sync changes', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).toHaveBeenCalledTimes(1);
    });

    it('Should send an sync webhook if the webhook url is present and if always send is checked and there were no sync changes', async () => {
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).toHaveBeenCalledTimes(1);
    });

    it('Should deliver to both webhook urls in a single deliver call when both are present', async () => {
        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([
            { url: primaryUrl, type: 'primary' },
            { url: secondaryUrl, type: 'secondary' }
        ]);
    });

    it('Should pass the correct body to deliver on sync success', async () => {
        const now = new Date();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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

        expect(deliverMock).toHaveBeenCalledTimes(1);
        const args = deliverMock.mock.calls[0]![0];
        expect(args.webhookType).toBe('sync');
        expect(args.body).toMatchObject({
            from: 'nango',
            type: 'sync',
            model: 'model',
            modifiedAfter: now.toISOString(),
            responseResults: { added: 10, updated: 0, deleted: 0 },
            connectionId: connection.connection_id,
            syncName: 'a_sync',
            syncVariant: 'base',
            providerConfigKey: connection.provider_config_key,
            success: true,
            syncType: 'INCREMENTAL'
        });
    });

    it('sends only to the per-connection webhook URL override (env secondary is dropped)', async () => {
        const responseResults = { added: 10, updated: 0, deleted: 0 };
        const overrideUrl = 'https://override.example.com/hook';

        await sendSync({
            account,
            connection,
            connectionConfig: { webhook_url: overrideUrl },
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now: new Date(),
            success: true,
            webhookSettings
        });

        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([{ url: overrideUrl, type: 'primary' }]);
    });

    it('Should not send an error webhook if the option is not checked', async () => {
        const error = {
            type: 'error',
            description: 'error description'
        };

        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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

        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should pass the correct body to deliver on sync error if the option is checked', async () => {
        const error = {
            type: 'error',
            description: 'error description'
        };

        await sendSync({
            account,
            connection,
            connectionConfig: null,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
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

        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].body).toMatchObject({
            type: 'sync',
            success: false,
            error
        });
    });

    it('Should not send a webhook-triggered sync completion webhook when the feature flag disables it', async () => {
        shouldSendSyncCompletedWebhook.mockResolvedValue(false);

        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            responseResults: { added: 10, updated: 0, deleted: 0 },
            success: true,
            operation: 'WEBHOOK',
            now: new Date(),
            webhookSettings
        });

        expect(shouldSendSyncCompletedWebhook).toHaveBeenCalledWith(1, connection.provider_config_key);
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should still send webhook-triggered sync error webhooks when the feature flag disables completion webhooks', async () => {
        shouldSendSyncCompletedWebhook.mockResolvedValue(false);

        await sendSync({
            account,
            connection,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
            providerConfig,
            syncConfig,
            syncVariant: 'base',
            model: 'model',
            success: false,
            error: {
                type: 'error',
                description: 'error description'
            },
            operation: 'WEBHOOK',
            now: new Date(),
            webhookSettings: {
                ...webhookSettings,
                on_sync_error: true
            }
        });

        expect(shouldSendSyncCompletedWebhook).not.toHaveBeenCalled();
        expect(deliverMock).toHaveBeenCalledTimes(1);
    });
});
