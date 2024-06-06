/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { sendSync } from './sync.js';
import { axiosInstance } from '@nangohq/utils';
import type { Connection, Environment } from '@nangohq/types';
import * as logPackage from '@nangohq/logs';

const spy = vi.spyOn(axiosInstance, 'post');

const connection: Pick<Connection, 'connection_id' | 'provider_config_key'> = {
    connection_id: '1',
    provider_config_key: 'providerkey'
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
            environment: { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: false } as Environment,
            syncName: 'syncName',
            model: 'model',
            responseResults,
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
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
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
            logCtx,
            environment: { name: 'dev', id: 1, secret_key: 'secret', webhook_url: null, always_send_webhook: true } as Environment
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
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
            logCtx,
            environment: { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://exmaple.com/webhook', always_send_webhook: false } as Environment
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
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
            logCtx,
            environment: { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: false } as Environment
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
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
            logCtx,
            environment: { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: true } as Environment
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
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
            logCtx,
            environment: { name: 'dev', id: 1, secret_key: 'secret', webhook_url: 'http://example.com/webhook', always_send_webhook: true } as Environment
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
            syncType: 'INCREMENTAL',
            now: new Date(),
            activityLogId: 1,
            logCtx,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret',
                webhook_url: 'http://example.com/webhook',
                webhook_url_secondary: 'http://example.com/webhook-secondary',
                always_send_webhook: true
            } as Environment
        });
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
