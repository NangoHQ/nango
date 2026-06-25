import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { Ok } from '@nangohq/utils';

import { sendAsyncActionWebhook } from './asyncAction.js';
import { deliver } from './utils.js';

import type { DBAPISecret, DBEnvironment, DBExternalWebhook } from '@nangohq/types';

vi.mock('./utils.js', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, deliver: vi.fn() };
});

const deliverMock = vi.mocked(deliver);

const primaryUrl = 'https://example.com/webhook';
const secondaryUrl = 'https://example.com/webhook-secondary';

const webhookSettings: DBExternalWebhook = {
    id: 1,
    environment_id: 1,
    primary_url: primaryUrl,
    secondary_url: secondaryUrl,
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
    id: 1
} as DBEnvironment;

const secret = 'secret' as DBAPISecret['secret'];

describe('AsyncAction webhooks', () => {
    beforeEach(() => {
        deliverMock.mockReset();
        deliverMock.mockResolvedValue(Ok(undefined));
    });

    it('should not be sent if on_async_action_completion is false', async () => {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'run' } },
            { account: { id: environment.account_id, name: '' }, environment: { id: environment.id, name: environment.name } }
        );
        await sendAsyncActionWebhook({
            connectionId: '123',
            secret,
            providerConfigKey: 'some-provider',
            webhookSettings: {
                ...webhookSettings,
                on_async_action_completion: false
            },
            payload: { id: '00000000-0000-0000-0000-000000000000', statusUrl: '/action/00000000-0000-0000-0000-000000000000' },
            logCtx
        });
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('should deliver to both urls with the correct body if on_async_action_completion is true', async () => {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'run' } },
            { account: { id: environment.account_id, name: '' }, environment: { id: environment.id, name: environment.name } }
        );
        const props = {
            connectionId: '123',
            secret,
            providerConfigKey: 'some-provider',
            webhookSettings: {
                ...webhookSettings,
                on_async_action_completion: true
            },
            payload: { id: '00000000-0000-0000-0000-000000000000', statusUrl: '/action/00000000-0000-0000-0000-000000000000' },
            logCtx
        };

        await sendAsyncActionWebhook(props);

        expect(deliverMock).toHaveBeenCalledTimes(1);
        const args = deliverMock.mock.calls[0]![0];
        expect(args.webhookType).toBe('async_action');
        expect(args.webhooks).toEqual([
            { url: primaryUrl, type: 'webhook url' },
            { url: secondaryUrl, type: 'secondary webhook url' }
        ]);
        expect(args.body).toEqual({
            type: 'async_action',
            from: 'nango',
            connectionId: props.connectionId,
            payload: props.payload,
            providerConfigKey: props.providerConfigKey
        });
    });
});
