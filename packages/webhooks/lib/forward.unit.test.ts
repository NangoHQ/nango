import { vi, expect, describe, it, beforeEach } from 'vitest';
import { forwardWebhook } from './forward.js';
import { axiosInstance } from '@nangohq/utils';
import type { DBEnvironment, DBTeam, ExternalWebhook, IntegrationConfig } from '@nangohq/types';
import { logContextGetter } from '@nangohq/logs';

const spy = vi.spyOn(axiosInstance, 'post');

const account: DBTeam = {
    id: 1,
    name: 'test',
    uuid: 'whatever',
    is_capped: true,
    created_at: new Date(),
    updated_at: new Date()
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

const integration = {
    id: 1,
    provider: 'hubspot',
    unique_key: 'hubspot'
} as IntegrationConfig;

describe('Webhooks: forward notification tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('Should not send a forward webhook if the webhook url is not present', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
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
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('Should send a forward webhook if the webhook url is not present but the secondary is', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
            webhookSettings: {
                ...webhookSettings,
                primary_url: ''
            },
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook if the webhook url is present', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
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
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Should send a forwarded webhook twice if the webhook url and secondary are present', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
            webhookSettings: webhookSettings,
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('Should send a forwarded webhook to each webhook and for each connection if the webhook url and secondary are present', async () => {
        await forwardWebhook({
            connectionIds: ['1', '2'],
            account,
            environment: {
                name: 'dev',
                id: 1,
                secret_key: 'secret'
            } as DBEnvironment,
            webhookSettings: webhookSettings,
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(spy).toHaveBeenCalledTimes(4);
    });
});
