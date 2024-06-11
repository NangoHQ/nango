/* eslint-disable @typescript-eslint/unbound-method */
import { vi, expect, describe, it, beforeEach } from 'vitest';
import { axiosInstance } from '@nangohq/utils';
import WebhookService from './webhook.service.js';
import type { Environment } from '../../models/Environment.js';
import { mockCreateActivityLog } from '../activity/mocks.js';
import { logContextGetter } from '@nangohq/logs';
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
});
