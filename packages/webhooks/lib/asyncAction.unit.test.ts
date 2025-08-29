import stringify from 'json-stable-stringify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { axiosInstance } from '@nangohq/utils';

import { sendAsyncActionWebhook } from './asyncAction.js';

import type { DBEnvironment, DBExternalWebhook } from '@nangohq/types';

const spy = vi.spyOn(axiosInstance, 'post');

const webhookSettings: DBExternalWebhook = {
    id: 1,
    environment_id: 1,
    primary_url: 'http://example.com/webhook',
    secondary_url: 'http://example.com/webhook-secondary',
    on_sync_completion_always: true,
    on_auth_creation: true,
    on_auth_refresh_error: true,
    on_sync_error: true,
    on_async_action_completion: true,
    created_at: new Date(),
    updated_at: new Date()
};
const environment = {
    name: 'dev',
    id: 1,
    secret_key: 'secret'
} as DBEnvironment;

describe('AsyncAction webhookds', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should not be sent if on_async_action_completion is false', async () => {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'run' } },
            { account: { id: environment.account_id, name: '' }, environment: { id: environment.id, name: environment.name } }
        );
        await sendAsyncActionWebhook({
            connectionId: '123',
            environment,
            providerConfigKey: 'some-provider',
            webhookSettings: {
                ...webhookSettings,
                on_async_action_completion: false
            },
            payload: { id: '00000000-0000-0000-0000-000000000000', statusUrl: '/action/00000000-0000-0000-0000-000000000000' },
            logCtx
        });
        expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should be sent if on_async_action_completion is true', async () => {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'run' } },
            { account: { id: environment.account_id, name: '' }, environment: { id: environment.id, name: environment.name } }
        );
        const props = {
            connectionId: '123',
            environment,
            providerConfigKey: 'some-provider',
            webhookSettings: {
                ...webhookSettings,
                on_async_action_completion: true
            },
            payload: { id: '00000000-0000-0000-0000-000000000000', statusUrl: '/action/00000000-0000-0000-0000-000000000000' },
            logCtx
        };

        await sendAsyncActionWebhook(props);

        expect(spy).toHaveBeenCalledTimes(2);
        const body = {
            type: 'async_action',
            from: 'nango',
            connectionId: props.connectionId,
            payload: props.payload,
            providerConfigKey: props.providerConfigKey
        };
        const bodyString = stringify(body);
        expect(spy).toHaveBeenNthCalledWith(1, webhookSettings.primary_url, bodyString, {
            headers: { 'X-Nango-Signature': expect.any(String), 'content-type': 'application/json' }
        });
        expect(spy).toHaveBeenNthCalledWith(2, webhookSettings.secondary_url, bodyString, {
            headers: { 'X-Nango-Signature': expect.any(String), 'content-type': 'application/json' }
        });
    });
});
