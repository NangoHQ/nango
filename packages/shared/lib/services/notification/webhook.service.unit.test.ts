/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { SyncType } from '../../models/Sync.js';
import { axiosInstance } from '@nangohq/utils';
import type { NangoConnection } from '../../models/Connection.js';
import WebhookService from './webhook.service.js';
import type { Environment } from '../../models/Environment.js';
import { mockCreateActivityLog } from '../activity/mocks.js';
import { LogContext, logContextGetter } from '@nangohq/logs';
import type { Account, Config } from '../../models/index.js';

const integration: Config = {
    id: 1,
    unique_key: 'providerKey',
    provider: 'provider',
    environment_id: 1,
    oauth_client_id: '',
    oauth_client_secret: ''
};
const account: Account = { id: 1, name: 'account', secret_key: '', uuid: 'uuid' };

const getLogCtx = () => new LogContext({ parentId: '1', operation: {} as any }, { dryRun: true, logToConsole: false });

const spy = vi.spyOn(axiosInstance, 'post');

describe('Webhook notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
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

        expect(spy).not.toHaveBeenCalled();
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
        expect(spy).toHaveBeenCalledTimes(1);
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
        expect(spy).toHaveBeenCalledTimes(1);
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
        expect(spy).toHaveBeenCalledTimes(2);
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
        expect(spy).not.toHaveBeenCalled();
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
        expect(axiosInstance.post).not.toHaveBeenCalled();
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
        expect(spy).not.toHaveBeenCalled();
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
        expect(spy).toHaveBeenCalled();
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
        expect(spy).toHaveBeenCalled();
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
        expect(spy).toHaveBeenCalled();
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
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
