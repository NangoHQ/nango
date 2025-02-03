import { vi, expect, describe, it, beforeEach } from 'vitest';
import { sendAuth } from './auth.js';
import { axiosInstance } from '@nangohq/utils';
import type { Connection, DBEnvironment, DBExternalWebhook } from '@nangohq/types';
import * as logPackage from '@nangohq/logs';

const spy = vi.spyOn(axiosInstance, 'post');

const connection: Pick<Connection, 'connection_id' | 'provider_config_key'> = {
    connection_id: '1',
    provider_config_key: 'providerkey'
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
    created_at: new Date(),
    updated_at: new Date()
};

const getLogCtx = () => new logPackage.LogContext({ parentId: '1', operation: {} as any }, { dryRun: true, logToConsole: false });

describe('Webhooks: forward notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send a forward webhook if the webhook url is not present', async () => {
        const logCtx = getLogCtx();

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
                secondary_url: ''
            },
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            logCtx
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send a forward webhook if the webhook url is not present but the secondary is', async () => {
        const logCtx = getLogCtx();

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
                primary_url: ''
            },
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook if the webhook url is present', async () => {
        const logCtx = getLogCtx();

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
                primary_url: ''
            },
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook twice if the webhook url and secondary are present', async () => {
        const logCtx = getLogCtx();

        await sendAuth({
            connection,
            success: true,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
            webhookSettings: webhookSettings,
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
