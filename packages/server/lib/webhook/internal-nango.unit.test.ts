import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { InternalNango } from './internal-nango.js';

const mocks = vi.hoisted(() => {
    return {
        envs: {
            WEBHOOK_INGRESS_USE_DISPATCH_QUEUE: true,
            WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY: 7
        },
        dispatchQueueClient: { dispatchQueuePublisher: null as any },
        triggerWebhook: vi.fn(),
        getConnection: vi.fn(),
        functionConfigSearch: vi.fn()
    };
});

vi.mock('../env.js', () => ({ envs: mocks.envs }));
vi.mock('./dispatch-queue/client.js', () => mocks.dispatchQueueClient);
vi.mock('../utils/utils.js', () => ({ getOrchestrator: () => ({ triggerWebhook: mocks.triggerWebhook }) }));
vi.mock('@nangohq/database', () => ({ default: { knex: {} } }));
vi.mock('@nangohq/shared', () => ({
    NangoError: class NangoError extends Error {},
    connectionService: { getConnection: mocks.getConnection },
    functionConfigService: { search: mocks.functionConfigSearch }
}));

function makeInternalNango({ allowUnverifiedWebhooks = false }: { allowUnverifiedWebhooks?: boolean } = {}) {
    return new InternalNango({
        team: { id: 1, uuid: 'team-uuid' } as any,
        environment: { id: 2 } as any,
        plan: undefined,
        integration: { id: 3, unique_key: 'github-dev', provider: 'github', allow_unverified_webhooks: allowUnverifiedWebhooks } as any,
        request: { method: 'POST', path: '/webhook/env/github-dev', headers: {}, query: {}, body: null },
        logContextGetter: { create: vi.fn() } as any
    });
}

describe('InternalNango', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getConnection.mockResolvedValue({
            success: true,
            response: { connection_id: 'conn-1', metadata: { webhookSecret: 'secret' } }
        });
    });

    it('retrieves connection metadata without dispatching a webhook', async () => {
        const nango = makeInternalNango();

        const connection = await nango.getConnectionForWebhook('conn-1');

        expect(mocks.getConnection).toHaveBeenCalledWith('conn-1', 'github-dev', 2);
        expect(connection).toEqual({ connectionId: 'conn-1', metadata: { webhookSecret: 'secret' } });
        expect(mocks.triggerWebhook).not.toHaveBeenCalled();
    });

    it('returns null when the webhook connection does not exist', async () => {
        mocks.getConnection.mockResolvedValue({ success: false, response: null });
        const nango = makeInternalNango();

        await expect(nango.getConnectionForWebhook('missing')).resolves.toBeNull();
    });

    describe('unverifiedOutcome', () => {
        it('prefers the integration setting over the flag', async () => {
            const flag = vi.fn().mockResolvedValue(true);

            await expect(makeInternalNango({ allowUnverifiedWebhooks: true }).unverifiedOutcome(flag)).resolves.toBe('setting');
            expect(flag).not.toHaveBeenCalled();
        });

        it('falls back to the flag for the account', async () => {
            const flag = vi.fn().mockResolvedValue(true);

            await expect(makeInternalNango().unverifiedOutcome(flag)).resolves.toBe('flag');
            expect(flag).toHaveBeenCalledWith('team-uuid');
        });

        it('rejects when neither allows it', async () => {
            await expect(makeInternalNango().unverifiedOutcome(vi.fn().mockResolvedValue(false))).resolves.toBe('rejected');
            await expect(makeInternalNango().unverifiedOutcome()).resolves.toBe('rejected');
        });
    });

    describe('markUnverified', () => {
        it('tags the metric with the outcome', () => {
            const increment = vi.spyOn(metrics, 'increment');
            const nango = makeInternalNango();

            nango.markUnverified({ reason: 'missing_secret' }, 'setting');
            nango.markUnverified({ reason: 'missing_secret' }, 'flag');
            nango.markUnverified({ reason: 'missing_secret' });

            expect(increment.mock.calls.map(([, , tags]) => (tags as { outcome: string }).outcome)).toEqual(['setting', 'flag', 'unenforced']);
        });

        it('only flags the forward when the webhook is let through', () => {
            const rejected = makeInternalNango();
            rejected.markUnverified({ reason: 'missing_secret' }, 'rejected');
            expect(rejected.unverified).toBeUndefined();

            const allowed = makeInternalNango();
            allowed.markUnverified({ reason: 'missing_secret' }, 'setting');
            expect(allowed.unverified).toEqual({ reason: 'missing_secret' });
        });
    });
});
