/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { axiosInstance } from '../../utils/axios.js';
import { SyncType } from '../../models/Sync.js';
import type { RecentlyCreatedConnection, NangoConnection, StoredConnection } from '../../models/Connection.js';
import WebhookService from './webhook.service.js';
import type { Environment } from '../../models/Environment.js';
import { LogContext, logContextGetter } from '@nangohq/logs';
import type { Account, Config } from '../../models/index.js';

vi.mock('../../utils/axios.js', () => ({
    axiosInstance: {
        post: vi.fn(() => Promise.resolve({ status: 200 })) // Mock axiosInstance.post as a spy
    },
    __esModule: true
}));

const integration: Config = {
    id: 1,
    unique_key: 'providerKey',
    provider: 'provider',
    environment_id: 1,
    oauth_client_id: '',
    oauth_client_secret: ''
};
const account: Account = { id: 1, name: 'account', secret_key: '', uuid: 'uuid' };
const connection: StoredConnection = {
    id: 1,
    connection_id: '1',
    provider_config_key: 'providerkey',
    connection_config: {},
    credentials: {},
    environment_id: 1
};

const getLogCtx = () => new LogContext({ parentId: '1', operation: {} as any }, { dryRun: true, logToConsole: false });

describe('Webhook notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send an auth webhook if the webhook url is not present', async () => {
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection,
                environment: { name: 'dev', id: 1, secret_key: 'secret', send_auth_webhook: false, webhook_url: null, always_send_webhook: true } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            logCtx
        );
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection,
                environment: {
                    name: 'dev',
                    id: 1,
                    secret_key: 'secret',
                    send_auth_webhook: true,
                    webhook_url: null,
                    webhook_url_secondary: null,
                    always_send_webhook: true
                } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            logCtx
        );
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if the webhook url is not present but the secondary is', async () => {
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection,
                environment: {
                    name: 'dev',
                    id: 1,
                    secret_key: 'secret',
                    send_auth_webhook: true,
                    webhook_url: null,
                    webhook_url_secondary: 'http://example.com/webhook-secondary',
                    always_send_webhook: true
                } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            logCtx
        );
        expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('Should send an auth webhook twice if the webhook url is present and the secondary is as well', async () => {
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection,
                environment: {
                    name: 'dev',
                    id: 1,
                    secret_key: 'secret',
                    send_auth_webhook: true,
                    webhook_url: 'http://example.com/webhook',
                    webhook_url_secondary: 'http://example.com/webhook-secondary',
                    always_send_webhook: true
                } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            logCtx
        );
        expect(axiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('Should send an auth webhook if the webhook url is present and if the auth webhook is checked', async () => {
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection,
                environment: {
                    name: 'dev',
                    id: 1,
                    secret_key: 'secret',
                    send_auth_webhook: true,
                    webhook_url: 'http://example.com/webhook',
                    always_send_webhook: true
                } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            logCtx
        );
        expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('Should not send an auth webhook if the webhook url is present and if the auth webhook is not checked', async () => {
        const logCtx = getLogCtx();
        await WebhookService.sendAuthUpdate(
            {
                connection,
                environment: {
                    name: 'dev',
                    id: 1,
                    secret_key: 'secret',
                    send_auth_webhook: false,
                    webhook_url: 'http://example.com/webhook',
                    webhook_url_secondary: 'http://example.com/webhook-secondary',
                    always_send_webhook: false
                } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            logCtx
        );
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should not send a forward webhook if the webhook url is not present', async () => {
        const environment = { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: false } as Environment;
        await WebhookService.forward({
            integration,
            account,
            environment,
            connectionIds: ['connection_1'],
            payload: {},
            webhookOriginalHeaders: {},
            logContextGetter
        });
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should send a forward webhook if the webhook url is not present but the secondary is', async () => {
        const environment = {
            name: 'dev',
            id: 1,
            secret_key: 'secret',
            webhook_url: null,
            webhook_url_secondary: 'http://example.com/webhook-secondary',
            always_send_webhook: false
        } as Environment;
        await WebhookService.forward({
            integration,
            account,
            environment,
            connectionIds: ['connection_1'],
            payload: {},
            webhookOriginalHeaders: {},
            logContextGetter
        });
        expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook if the webhook url is present', async () => {
        const environment = { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: false } as Environment;
        await WebhookService.forward({
            integration,
            account,
            environment,
            connectionIds: ['connection_1'],
            payload: {},
            webhookOriginalHeaders: {},
            logContextGetter
        });
        expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook twice if the webhook url and secondary are present', async () => {
        const environment = {
            name: 'dev',
            id: 1,
            secret_key: 'secret',
            webhook_url: 'http://example.com/webhook',
            webhook_url_secondary: 'http://example.com/webhook-secondary',
            always_send_webhook: false
        } as Environment;
        await WebhookService.forward({
            integration,
            account,
            environment,
            connectionIds: ['connection_1'],
            payload: {},
            webhookOriginalHeaders: {},
            logContextGetter
        });
        expect(axiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('Should not send a sync webhook if the webhook url is not present', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: false } as Environment
        );
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present even if always send is checked', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: true } as Environment
        );
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is present but if always send is not checked and there were no sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://exmaple.com/webhook', always_send_webhook: false } as Environment
        );
        expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is not checked and there were sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: false } as Environment
        );
        expect(axiosInstance.post).toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is checked and there were sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: true } as Environment
        );
        expect(axiosInstance.post).toHaveBeenCalled();
    });

    it('Should send an sync webhook if the webhook url is present and if always send is checked and there were no sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: true } as Environment
        );
        expect(axiosInstance.post).toHaveBeenCalled();
    });

    it('Should send an sync webhook twice if the webhook url and secondary are present and if always send is checked and there were no sync changes', async () => {
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            logCtx,
            {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                webhook_url: 'http://example.com/webhook',
                webhook_url_secondary: 'http://example.com/webhook-secondary',
                always_send_webhook: true
            } as Environment
        );
        expect(axiosInstance.post).toHaveBeenCalledTimes(2);
    });
});
