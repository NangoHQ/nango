/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { sendAuth } from './auth.js';
import { axiosInstance } from '@nangohq/utils';
import type { Connection, Environment } from '@nangohq/types';
import * as logPackage from '@nangohq/logs';

function mockCreateActivityLog() {
    return vi.spyOn(logPackage, 'createActivityLog').mockImplementation(() => {
        return Promise.resolve(1);
    });
}

const spy = vi.spyOn(axiosInstance, 'post');

const connection: Pick<Connection, 'connection_id' | 'provider_config_key'> = {
    connection_id: '1',
    provider_config_key: 'providerkey'
};

const getLogCtx = () => new logPackage.LogContext({ parentId: '1', operation: {} as any }, { dryRun: true, logToConsole: false });

describe('Webhooks: auth notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await sendAuth({
            connection,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                send_auth_webhook: true,
                webhook_url: null,
                webhook_url_secondary: null,
                always_send_webhook: true
            } as Environment,
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            activityLogId: 1,
            logCtx
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await sendAuth({
            connection,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                send_auth_webhook: true,
                webhook_url: null,
                webhook_url_secondary: null,
                always_send_webhook: true
            } as Environment,
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            activityLogId: 1,
            logCtx
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if the webhook url is not present but the secondary is', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await sendAuth({
            connection,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                send_auth_webhook: true,
                webhook_url: null,
                webhook_url_secondary: 'http://example.com/webhook-secondary',
                always_send_webhook: true
            } as Environment,
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            activityLogId: 1,
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send an auth webhook twice if the webhook url is present and the secondary is as well', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await sendAuth({
            connection,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                send_auth_webhook: true,
                webhook_url: 'http://example.com/webhook',
                webhook_url_secondary: 'http://example.com/webhook-secondary',
                always_send_webhook: true
            } as Environment,
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            activityLogId: 1,
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('Should send an auth webhook if the webhook url is present and if the auth webhook is checked', async () => {
        mockCreateActivityLog();

        const logCtx = getLogCtx();

        await sendAuth({
            connection,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                send_auth_webhook: true,
                webhook_url: 'http://example.com/webhook',
                always_send_webhook: true
            } as Environment,
            provider: 'hubspot',
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            activityLogId: 1,
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should not send an auth webhook if the webhook url is present and if the auth webhook is not checked', async () => {
        mockCreateActivityLog();

        const logCtx = getLogCtx();
        await sendAuth({
            connection,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                send_auth_webhook: false,
                webhook_url: 'http://example.com/webhook',
                webhook_url_secondary: 'http://example.com/webhook-secondary',
                always_send_webhook: false
            } as Environment,
            provider: 'hubspot',
            activityLogId: 1,
            type: 'auth',
            auth_mode: 'OAUTH2',
            operation: 'creation',
            logCtx
        });
        expect(spy).not.toHaveBeenCalled();
    });
});
