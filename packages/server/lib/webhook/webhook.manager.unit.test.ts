import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { routeWebhook } from './webhook.manager.js';

import type { WebhookRequest, WebhookResponse } from './types.js';
import type * as DatabaseModule from '@nangohq/database';
import type { LogContextGetter } from '@nangohq/logs';
import type * as SharedModule from '@nangohq/shared';
import type { Config } from '@nangohq/shared';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

const mocks = vi.hoisted(() => ({
    handler: vi.fn(),
    forwardWebhook: vi.fn<(args: { connectionIds: string[]; payload: unknown }) => Promise<unknown>>(),
    getProvider: vi.fn(),
    getWebhookSettings: vi.fn(),
    getWebhookUrlOverrides: vi.fn<(args: { connectionIds: string[] }) => Promise<Map<string, string>>>(),
    publishBatch: vi.fn()
}));

vi.mock('@nangohq/database', async (importOriginal) => {
    const actual = await importOriginal<typeof DatabaseModule>();
    return { ...actual, default: { knex: {} } };
});
vi.mock('@nangohq/webhooks', () => ({ forwardWebhook: mocks.forwardWebhook }));
vi.mock('../utils/usage.js', () => ({ capping: { getStatus: () => Promise.resolve({ isCapped: false }) } }));
vi.mock('./index.js', () => ({ testWebhookRouting: mocks.handler }));
vi.mock('./internal-nango.js', () => ({
    InternalNango: class {
        unverified = undefined;
    }
}));
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof SharedModule>();
    return {
        ...actual,
        getProvider: mocks.getProvider,
        externalWebhookService: { get: mocks.getWebhookSettings },
        customerKeyService: { getWebhookSigningKeyForEnv: () => Promise.resolve(Ok('signing-secret')) },
        connectionService: { getWebhookUrlOverridesByConnectionIds: mocks.getWebhookUrlOverrides },
        pubsub: { publisher: { publishBatch: mocks.publishBatch } }
    };
});

const environment = { id: 1, name: 'dev' } as DBEnvironment;
const account = { id: 1 } as DBTeam;
const integration = { id: 1, unique_key: 'my-integration', provider: 'test-provider' } as Config;
const logContextGetter = {} as LogContextGetter;
const body = { event: 'original' };
const request: WebhookRequest = {
    method: 'POST',
    path: '/webhook',
    headers: { 'content-type': 'application/json' },
    rawHeaders: { 'content-type': 'application/json' },
    query: {},
    body,
    rawBody: JSON.stringify(body)
};

function route(response: WebhookResponse) {
    mocks.handler.mockResolvedValue(Ok(response));
    return routeWebhook({ environment, account, integration, request, logContextGetter });
}

function forwardedCalls() {
    return mocks.forwardWebhook.mock.calls.map(([args]) => ({ connectionIds: args.connectionIds, payload: args.payload }));
}

describe('routeWebhook forwarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getProvider.mockReturnValue({ webhook_routing_script: 'testWebhookRouting' });
        mocks.getWebhookSettings.mockResolvedValue({ id: 1 });
        mocks.getWebhookUrlOverrides.mockResolvedValue(new Map());
        mocks.forwardWebhook.mockResolvedValue(Ok({ results: [] }));
    });

    it('does not forward when the handler sets noForward', async () => {
        const res = await route({ content: 'validation-token', statusCode: 200, noForward: true });

        expect(res).toEqual({ content: 'validation-token', statusCode: 200, noForward: true });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(mocks.forwardWebhook).not.toHaveBeenCalled();
    });

    it('forwards once with the response connection ids and toForward payload when there are no groups', async () => {
        await route({ content: { status: 'success' }, statusCode: 200, connectionIds: ['conn-1', 'conn-2'], toForward: { event: 'rewritten' } });

        await vi.waitFor(() => expect(mocks.forwardWebhook).toHaveBeenCalledTimes(1));
        expect(forwardedCalls()).toEqual([{ connectionIds: ['conn-1', 'conn-2'], payload: { event: 'rewritten' } }]);
    });

    it('forwards the original request body when the handler returns no toForward', async () => {
        await route({ content: { status: 'success' }, statusCode: 200, connectionIds: ['conn-1'] });

        await vi.waitFor(() => expect(mocks.forwardWebhook).toHaveBeenCalledTimes(1));
        expect(forwardedCalls()).toEqual([{ connectionIds: ['conn-1'], payload: body }]);
    });

    it('forwards each group with its own connections and payload, one after another', async () => {
        let releaseFirst: (() => void) | undefined;
        mocks.forwardWebhook.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseFirst = () => resolve(Ok({ results: [] }));
                })
        );

        await route({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: ['conn-1', 'conn-2'],
            forwardGroups: [
                { connectionIds: ['conn-1'], payload: { value: ['a'] } },
                { connectionIds: ['conn-2'], payload: { value: ['b'] } },
                { connectionIds: [], payload: { value: ['unmatched'] } }
            ]
        });

        await vi.waitFor(() => expect(mocks.forwardWebhook).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(mocks.forwardWebhook).toHaveBeenCalledTimes(1);

        releaseFirst?.();
        await vi.waitFor(() => expect(mocks.forwardWebhook).toHaveBeenCalledTimes(3));
        expect(forwardedCalls()).toEqual([
            { connectionIds: ['conn-1'], payload: { value: ['a'] } },
            { connectionIds: ['conn-2'], payload: { value: ['b'] } },
            { connectionIds: [], payload: { value: ['unmatched'] } }
        ]);
        expect(mocks.getWebhookUrlOverrides).toHaveBeenCalledTimes(1);
        expect(mocks.getWebhookUrlOverrides.mock.calls[0]?.[0].connectionIds).toEqual(['conn-1', 'conn-2']);
    });
});
