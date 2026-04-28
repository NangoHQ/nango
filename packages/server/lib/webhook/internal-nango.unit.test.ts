import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    return {
        envs: {
            WEBHOOK_INGRESS_USE_DISPATCH_QUEUE: true,
            WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY: 7
        },
        getDispatchQueuePublisher: vi.fn(),
        triggerWebhook: vi.fn(),
        getConnectionsByEnvironmentAndConfig: vi.fn(),
        getSyncConfigsByConfigIdForWebhook: vi.fn()
    };
});

vi.mock('../env.js', () => ({ envs: mocks.envs }));
vi.mock('./dispatch-queue/client.js', () => ({ getDispatchQueuePublisher: mocks.getDispatchQueuePublisher }));
vi.mock('../utils/utils.js', () => ({ getOrchestrator: () => ({ triggerWebhook: mocks.triggerWebhook }) }));
vi.mock('@nangohq/shared', () => {
    class NangoError extends Error {
        public payload: Record<string, unknown>;

        constructor(type: string, payload: Record<string, unknown>) {
            super(type);
            this.name = type;
            this.payload = payload;
        }
    }

    return {
        NangoError,
        connectionService: {
            getConnectionsByEnvironmentAndConfig: mocks.getConnectionsByEnvironmentAndConfig
        },
        getSyncConfigsByConfigIdForWebhook: mocks.getSyncConfigsByConfigIdForWebhook
    };
});

import { InternalNango } from './internal-nango.js';

function createLogCtx(id: string) {
    return {
        id,
        operation: { id },
        attachSpan: vi.fn(),
        info: vi.fn().mockResolvedValue(true),
        error: vi.fn().mockResolvedValue(true),
        enrichOperation: vi.fn().mockResolvedValue(undefined),
        failed: vi.fn().mockResolvedValue(undefined)
    };
}

function makeInternalNango(logContexts: ReturnType<typeof createLogCtx>[]) {
    const logContextGetter = {
        create: vi.fn().mockImplementation(() => {
            const next = logContexts.shift();
            if (!next) {
                throw new Error('Missing log context');
            }
            return next;
        })
    } as any;

    return {
        nango: new InternalNango({
            team: { id: 1 } as any,
            environment: { id: 2 } as any,
            plan: undefined,
            integration: { id: 3, unique_key: 'github-dev', provider: 'github' } as any,
            logContextGetter
        }),
        logContextGetter
    };
}

describe('InternalNango queue dispatch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.envs.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE = true;
        mocks.getConnectionsByEnvironmentAndConfig.mockResolvedValue([
            { id: 11, connection_id: 'conn-1', provider_config_key: 'github-dev', environment_id: 2, metadata: null },
            { id: 12, connection_id: 'conn-2', provider_config_key: 'github-dev', environment_id: 2, metadata: null }
        ]);
        mocks.getSyncConfigsByConfigIdForWebhook.mockResolvedValue([{ id: 21, sync_name: 'sync-1', webhook_subscriptions: ['push'] }]);
        mocks.triggerWebhook.mockResolvedValue(undefined);
    });

    it('logs queued successes and marks failed publishes as failed operations', async () => {
        const publisher = {
            publish: vi.fn().mockResolvedValue({ enqueued: 1, failed: 1, failedActivityLogIds: ['log-2'] })
        };
        mocks.getDispatchQueuePublisher.mockReturnValue(publisher);

        const logCtx1 = createLogCtx('log-1');
        const logCtx2 = createLogCtx('log-2');
        const { nango } = makeInternalNango([logCtx1, logCtx2]);

        const result = await nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        expect(result.connectionIds).toEqual(['conn-1', 'conn-2']);
        expect(publisher.publish).toHaveBeenCalledTimes(1);
        expect(logCtx1.info).toHaveBeenCalledWith('The webhook was successfully queued for execution', {
            action: 'push',
            connection: 'conn-1',
            integration: 'github-dev'
        });
        expect(logCtx2.error).toHaveBeenCalledWith('The webhook failed to queue for execution', {
            error: expect.any(Error),
            webhook: 'push',
            connection: 'conn-2',
            integration: 'github-dev'
        });
        expect(logCtx2.enrichOperation).toHaveBeenCalledWith({ error: expect.any(Error) });
        expect(logCtx2.failed).toHaveBeenCalledOnce();
    });

    it('falls back to direct orchestrator dispatch when the feature flag is off', async () => {
        mocks.envs.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE = false;
        const publisher = { publish: vi.fn() };
        mocks.getDispatchQueuePublisher.mockReturnValue(publisher);

        const { nango, logContextGetter } = makeInternalNango([]);

        const result = await nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        expect(result.connectionIds).toEqual(['conn-1', 'conn-2']);
        expect(mocks.getDispatchQueuePublisher).not.toHaveBeenCalled();
        expect(mocks.triggerWebhook).toHaveBeenCalledTimes(2);
        expect(logContextGetter.create).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
    });
});
