/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { sendSync } from './sync.js';
import { axiosInstance } from '@nangohq/utils';
import type { NangoSyncWebhookBodySuccess, Connection, Environment, ExternalWebhook } from '@nangohq/types';
import * as logPackage from '@nangohq/logs';

const spy = vi.spyOn(axiosInstance, 'post');

const connection: Pick<Connection, 'connection_id' | 'provider_config_key'> = {
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
    on_sync_error: true
};

const getLogCtx = () => new logPackage.LogContext({ parentId: '1', operation: {} as any }, { dryRun: true, logToConsole: false });

describe('Webhooks: sync notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send a sync webhook if the webhook url is not present', async () => {
        const logCtx = getLogCtx();
        const responseResults = { added: 10, updated: 0, deleted: 0 };

        await sendSync({
            connection,
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment,
            webhookSettings: {
                ...webhookSettings,
                primary_url: '',
                secondary_url: '',
                on_sync_completion_always: false
            },
            syncName: 'syncName',
            model: 'model',
            responseResults,
            success: true,
            operation: 'INCREMENTAL',
            now: new Date(),
            logCtx
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present even if always send is checked', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            success: true,
            operation: 'INCREMENTAL',
            now: new Date(),
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                primary_url: '',
                secondary_url: '',
                on_sync_completion_always: true
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is present but if always send is not checked and there were no sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            success: true,
            now: new Date(),
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: false
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is not checked and there were sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            success: true,
            now: new Date(),
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: false
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });
        expect(spy).toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is checked and there were sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            success: true,
            now: new Date(),
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: true
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });
        expect(spy).toHaveBeenCalled();
    });

    it('Should send an sync webhook if the webhook url is present and if always send is checked and there were no sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now: new Date(),
            logCtx,
            success: true,
            webhookSettings: {
                ...webhookSettings,
                secondary_url: '',
                on_sync_completion_always: true
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });
        expect(spy).toHaveBeenCalled();
    });

    it('Should send an sync webhook twice if the webhook url and secondary are present and if always send is checked and there were no sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now: new Date(),
            success: true,
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                on_sync_completion_always: true
            },
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as Environment
        });
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('Should send a webhook with the correct body on sync success', async () => {
        const logCtx = getLogCtx();

        const now = new Date();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            operation: 'INCREMENTAL',
            now,
            success: true,
            logCtx,
            webhookSettings: webhookSettings,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as Environment
        });

        const body: NangoSyncWebhookBodySuccess = {
            from: 'nango',
            type: 'sync',
            modifiedAfter: now.toISOString(),
            model: 'model',
            queryTimeStamp: now as unknown as string,
            responseResults,
            connectionId: connection.connection_id,
            syncName: 'syncName',
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
        const logCtx = getLogCtx();

        const error = {
            type: 'error',
            description: 'error description'
        };

        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            success: false,
            error,
            operation: 'INCREMENTAL',
            now: new Date(),
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                on_sync_error: false
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });

        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send an error webhook if the option is checked with the correct body', async () => {
        const logCtx = getLogCtx();

        const error = {
            type: 'error',
            description: 'error description'
        };

        await sendSync({
            connection,
            syncName: 'syncName',
            model: 'model',
            success: false,
            error,
            operation: 'INCREMENTAL',
            now: new Date(),
            logCtx,
            webhookSettings: {
                ...webhookSettings,
                on_sync_error: true
            },
            environment: { name: 'dev', id: 1, secret_key: 'secret' } as Environment
        });

        expect(spy).toHaveBeenCalled();
    });
});
