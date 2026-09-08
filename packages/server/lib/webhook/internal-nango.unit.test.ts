import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function makeInternalNango() {
    return new InternalNango({
        team: { id: 1 } as any,
        environment: { id: 2 } as any,
        plan: undefined,
        integration: { id: 3, unique_key: 'github-dev', provider: 'github' } as any,
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
});
