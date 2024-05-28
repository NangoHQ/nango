/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import axios from 'axios';
import { SyncType } from '../../models/Sync.js';
import type { RecentlyCreatedConnection, NangoConnection } from '../../models/Connection.js';
import WebhookService from './webhook.service.js';
import type { Environment } from '../../models/Environment.js';
import { mockCreateActivityLog } from '../activity/mocks.js';
import { LogContext, logContextGetter } from '@nangohq/logs';
import type { Account, Config } from '../../models/index.js';

vi.mock('axios', () => ({
    default: {
        post: vi.fn(() => Promise.resolve({ status: 200 })) // Mock axios.post as a spy
    },
    __esModule: true
}));

const integration: Config = { id: 1, unique_key: 'providerKey', provider: 'provider', environment_id: 1, oauth_client_id: '', oauth_client_secret: '' };
const account: Account = { id: 1, name: 'account', secret_key: '', uuid: 'uuid' };

const getLogCtx = () => new LogContext({ parentId: '1', operation: {} as any }, { dryRun: true, logToConsole: false });

describe('Webhook notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send an auth webhook if the webhook url is not present', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection_id: 'foo',
                environment: { name: 'dev', id: 1, secret_key: 'secret', send_auth_webhook: false, webhook_url: null, always_send_webhook: true } as Environment
            } as RecentlyCreatedConnection,
            'hubspot',
            true,
            1,
            logCtx
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send an auth webhook if the webhook url is not present even if the auth webhook is checked', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection_id: 'foo',
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
            1,
            logCtx
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should send an auth webhook if the webhook url is not present but the secondary is', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection_id: 'foo',
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
            1,
            logCtx
        );
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('Should send an auth webhook twice if the webhook url is present and the secondary is as well', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection_id: 'foo',
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
            1,
            logCtx
        );
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('Should send an auth webhook if the webhook url is present and if the auth webhook is checked', async () => {
        mockCreateActivityLog();

        const logCtx = getLogCtx();

        await WebhookService.sendAuthUpdate(
            {
                connection_id: 'foo',
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
            1,
            logCtx
        );
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('Should not send an auth webhook if the webhook url is present and if the auth webhook is not checked', async () => {
        mockCreateActivityLog();

        const logCtx = getLogCtx();
        await WebhookService.sendAuthUpdate(
            {
                connection_id: 'foo',
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
            1,
            logCtx
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send a forward webhook if the webhook url is not present', async () => {
        mockCreateActivityLog();

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
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should send a forward webhook if the webhook url is not present but the secondary is', async () => {
        mockCreateActivityLog();

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
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook if the webhook url is present', async () => {
        mockCreateActivityLog();
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
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook twice if the webhook url and secondary are present', async () => {
        mockCreateActivityLog();
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
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('Should not send a sync webhook if the webhook url is not present', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: false } as Environment
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is not present even if always send is checked', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: true } as Environment
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should not send a sync webhook if the webhook url is present but if always send is not checked and there were no sync changes', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://exmaple.com/webhook', always_send_webhook: false } as Environment
        );
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is not checked and there were sync changes', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: false } as Environment
        );
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should send a sync webhook if the webhook url is present and if always send is checked and there were sync changes', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 10, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: true } as Environment
        );
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should send an sync webhook if the webhook url is present and if always send is checked and there were no sync changes', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
            logCtx,
            { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: true } as Environment
        );
        expect(axios.post).toHaveBeenCalled();
    });

    it('Should send an sync webhook twice if the webhook url and secondary are present and if always send is checked and there were no sync changes', async () => {
        mockCreateActivityLog();
        const logCtx = getLogCtx();

        const responseResults = { added: 0, updated: 0, deleted: 0 };
        await WebhookService.sendSyncUpdate(
            { environment_id: 1 } as NangoConnection,
            'syncName',
            'model',
            responseResults,
            SyncType.INCREMENTAL,
            new Date(),
            1,
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
        expect(axios.post).toHaveBeenCalledTimes(2);
    });
});
