import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { Ok } from '@nangohq/utils';

import { forwardWebhook } from './forward.js';
import { deliver } from './utils.js';

import type { DBAPISecret, DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig } from '@nangohq/types';

vi.mock('./utils.js', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, deliver: vi.fn() };
});

const deliverMock = vi.mocked(deliver);

const primaryUrl = 'https://example.com/webhook';
const secondaryUrl = 'https://example.com/webhook-secondary';

const account: DBTeam = {
    id: 1,
    name: 'test',
    uuid: 'whatever',
    found_us: '',
    created_at: new Date(),
    updated_at: new Date()
};

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

const integration = {
    id: 1,
    provider: 'hubspot',
    unique_key: 'hubspot',
    forward_webhooks: true
} as IntegrationConfig;

const secret = 'secret' as DBAPISecret['secret'];

describe('Webhooks: forward notification tests', () => {
    beforeEach(() => {
        deliverMock.mockReset();
        deliverMock.mockImplementation((args) => {
            args.onBytes?.({ sent: 10, received: 5 });
            return Promise.resolve(Ok(undefined));
        });
    });

    it('Should not send a forward webhook if the webhook url is not present', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
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
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should not send a forward webhook if forward_webhooks is false', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings,
            logContextGetter,
            integration: {
                ...integration,
                forward_webhooks: false
            },
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should send a forward webhook to the secondary url if the primary is not present', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
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
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([{ url: secondaryUrl, type: 'secondary webhook url' }]);
    });

    it('Should deliver to both webhook urls in a single deliver call when both are present', async () => {
        await forwardWebhook({
            connectionIds: [],
            account,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings,
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(deliverMock).toHaveBeenCalledTimes(1);
        expect(deliverMock.mock.calls[0]![0].webhooks).toEqual([
            { url: primaryUrl, type: 'webhook url' },
            { url: secondaryUrl, type: 'secondary webhook url' }
        ]);
    });

    it('Should call deliver once per connection when connectionIds are present', async () => {
        await forwardWebhook({
            connectionIds: ['1', '2'],
            account,
            environment: {
                name: 'dev',
                id: 1
            } as DBEnvironment,
            secret,
            webhookSettings,
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {
                'content-type': 'application/json'
            }
        });
        expect(deliverMock).toHaveBeenCalledTimes(2);
        for (const call of deliverMock.mock.calls) {
            expect(call[0].webhooks).toEqual([
                { url: primaryUrl, type: 'webhook url' },
                { url: secondaryUrl, type: 'secondary webhook url' }
            ]);
        }
        expect(deliverMock.mock.calls[0]![0].body).toMatchObject({ connectionId: '1' });
        expect(deliverMock.mock.calls[1]![0].body).toMatchObject({ connectionId: '2' });
    });

    it('Should report bytes via onBytes on successful forward', async () => {
        let reportedBytes: { sent: number; received: number } | undefined;
        const result = await forwardWebhook({
            connectionIds: [],
            account,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
            webhookSettings,
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {},
            onBytes: (b) => {
                reportedBytes = b;
            }
        });
        expect(result.isOk()).toBe(true);
        expect(reportedBytes).toEqual({ sent: 10, received: 5 });
    });

    it('Should not invoke onBytes when forwarding is skipped', async () => {
        let called = false;
        const result = await forwardWebhook({
            connectionIds: [],
            account,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
            webhookSettings: null,
            logContextGetter,
            integration,
            payload: { some: 'data' },
            webhookOriginalHeaders: {},
            onBytes: () => {
                called = true;
            }
        });
        expect(result.isOk()).toBe(true);
        expect(called).toBe(false);
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('Should invoke onBytes once per connection with that connection id', async () => {
        const connectionIds = ['conn1', 'conn2'];
        const calls: { connectionId: string; sent: number }[] = [];
        const result = await forwardWebhook({
            connectionIds,
            account,
            environment: { name: 'dev', id: 1 } as DBEnvironment,
            secret,
            webhookSettings: { ...webhookSettings, secondary_url: '' },
            logContextGetter,
            integration,
            payload: { x: 1 },
            webhookOriginalHeaders: {},
            onBytes: (b, connectionId) => {
                calls.push({ connectionId, sent: b.sent });
            }
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.results.filter((r) => r.success).length).toBe(2);
        }
        expect(calls).toEqual([
            { connectionId: 'conn1', sent: 10 },
            { connectionId: 'conn2', sent: 10 }
        ]);
    });
});
