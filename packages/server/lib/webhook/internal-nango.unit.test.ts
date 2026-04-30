import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    return {
        envs: {
            WEBHOOK_INGRESS_USE_DISPATCH_QUEUE: true,
            WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY: 7
        },
        dispatchQueueClient: { dispatchQueuePublisher: null as any },
        triggerWebhook: vi.fn(),
        increment: vi.fn(),
        report: vi.fn(),
        getConnectionsByEnvironmentAndConfig: vi.fn(),
        getSyncConfigsByConfigIdForWebhook: vi.fn()
    };
});

vi.mock('../env.js', () => ({ envs: mocks.envs }));
vi.mock('./dispatch-queue/client.js', () => mocks.dispatchQueueClient);
vi.mock('../utils/utils.js', () => ({ getOrchestrator: () => ({ triggerWebhook: mocks.triggerWebhook }) }));
vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();

    return {
        ...(actual as object),
        metrics: {
            ...(actual as any).metrics,
            Types: {
                WEBHOOK_DIRECT_TRIGGER_SUCCESS: 'nango.webhook.direct_trigger.success',
                WEBHOOK_DISPATCH_LARGE_FANOUT: 'nango.webhook.dispatch_queue.large_fanout'
            },
            increment: mocks.increment
        },
        report: mocks.report
    };
});
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

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function makeInternalNango(logContexts: ReturnType<typeof createLogCtx>[], logContextGetterOverride?: any) {
    const logContextGetter =
        logContextGetterOverride ??
        ({
            create: vi.fn().mockImplementation(() => {
                const next = logContexts.shift();
                if (!next) {
                    throw new Error('Missing log context');
                }
                return next;
            })
        } as any);

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
        mocks.increment.mockClear();
        mocks.envs.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE = true;
        mocks.dispatchQueueClient.dispatchQueuePublisher = null;
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
        mocks.dispatchQueueClient.dispatchQueuePublisher = publisher;

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
        mocks.dispatchQueueClient.dispatchQueuePublisher = publisher;

        const { nango, logContextGetter } = makeInternalNango([]);

        const result = await nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        expect(result.connectionIds).toEqual(['conn-1', 'conn-2']);
        expect(mocks.triggerWebhook).toHaveBeenCalledTimes(2);
        expect(logContextGetter.create).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
        expect(mocks.increment).toHaveBeenCalledWith('nango.webhook.direct_trigger.success', 2, { provider: 'github' });
    });

    it('creates log contexts concurrently before publishing queue messages', async () => {
        const publisher = {
            publish: vi.fn().mockResolvedValue({ enqueued: 2, failed: 0, failedActivityLogIds: [] })
        };
        mocks.dispatchQueueClient.dispatchQueuePublisher = publisher;

        const blockers = [deferred<void>(), deferred<void>()];
        const contexts = [createLogCtx('log-1'), createLogCtx('log-2')];
        let createIndex = 0;
        let inFlight = 0;
        let maxInFlight = 0;
        const logContextGetter = {
            create: vi.fn().mockImplementation(async () => {
                const index = createIndex++;
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await blockers[index]!.promise;
                inFlight -= 1;
                return contexts[index]!;
            })
        } as any;
        const { nango } = makeInternalNango([], logContextGetter);

        const execution = nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        await vi.waitFor(() => {
            expect(logContextGetter.create).toHaveBeenCalledTimes(2);
        });
        expect(maxInFlight).toBe(2);

        blockers[0]!.resolve();
        blockers[1]!.resolve();

        const result = await execution;

        expect(result.connectionIds).toEqual(['conn-1', 'conn-2']);
        expect(publisher.publish).toHaveBeenCalledOnce();
    });

    it('publishes successful executions even when one log context creation fails', async () => {
        const publisher = {
            publish: vi.fn().mockResolvedValue({ enqueued: 1, failed: 0, failedActivityLogIds: [] })
        };
        mocks.dispatchQueueClient.dispatchQueuePublisher = publisher;

        const logCtx = createLogCtx('log-2');
        const logContextGetter = {
            create: vi.fn().mockRejectedValueOnce(new Error('transient db failure')).mockResolvedValueOnce(logCtx)
        } as any;
        const { nango } = makeInternalNango([], logContextGetter);

        const result = await nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        expect(result.connectionIds).toEqual(['conn-1', 'conn-2']);
        expect(publisher.publish).toHaveBeenCalledTimes(1);
        expect(publisher.publish).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    activityLogId: 'log-2',
                    webhookName: 'push',
                    connection: expect.objectContaining({ connection_id: 'conn-2' })
                })
            ],
            'account:1:env:2'
        );
        expect(logCtx.info).toHaveBeenCalledWith('The webhook was successfully queued for execution', {
            action: 'push',
            connection: 'conn-2',
            integration: 'github-dev'
        });
        expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), {
            error: 'The webhook could not be prepared for queue dispatch',
            provider: 'github',
            accountId: 1,
            environmentId: 2,
            syncConfigId: 21,
            syncName: 'sync-1',
            webhook: 'push',
            connectionId: 11,
            connection: 'conn-1',
            integration: 'github-dev'
        });
    });

    it('fails the log context when queue preparation fails after creation', async () => {
        const publisher = {
            publish: vi.fn().mockResolvedValue({ enqueued: 1, failed: 0, failedActivityLogIds: [] })
        };
        mocks.dispatchQueueClient.dispatchQueuePublisher = publisher;

        const failedLogCtx = createLogCtx('log-1');
        failedLogCtx.attachSpan.mockImplementation(() => {
            throw new Error('attach span failed');
        });
        const successfulLogCtx = createLogCtx('log-2');
        const { nango } = makeInternalNango([failedLogCtx, successfulLogCtx]);

        const result = await nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        expect(result.connectionIds).toEqual(['conn-1', 'conn-2']);
        expect(publisher.publish).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    activityLogId: 'log-2',
                    connection: expect.objectContaining({ connection_id: 'conn-2' })
                })
            ],
            'account:1:env:2'
        );
        expect(failedLogCtx.error).toHaveBeenCalledWith('The webhook failed during queue preparation', {
            error: expect.any(Error),
            webhook: 'push',
            connection: 'conn-1',
            integration: 'github-dev'
        });
        expect(failedLogCtx.enrichOperation).toHaveBeenCalledWith({ error: expect.any(Error) });
        expect(failedLogCtx.failed).toHaveBeenCalledOnce();
        expect(successfulLogCtx.info).toHaveBeenCalledWith('The webhook was successfully queued for execution', {
            action: 'push',
            connection: 'conn-2',
            integration: 'github-dev'
        });
    });

    it('marks all executions as failed and reports when publish has unmapped failures', async () => {
        const publisher = {
            publish: vi.fn().mockResolvedValue({ enqueued: 0, failed: 2, failedActivityLogIds: [] })
        };
        mocks.dispatchQueueClient.dispatchQueuePublisher = publisher;

        const logCtx1 = createLogCtx('log-1');
        const logCtx2 = createLogCtx('log-2');
        const { nango } = makeInternalNango([logCtx1, logCtx2]);

        await nango.executeScriptForWebhooks({ body: { event: 'x' }, webhookTypeValue: 'push' });

        expect(logCtx1.info).not.toHaveBeenCalled();
        expect(logCtx2.info).not.toHaveBeenCalled();
        expect(logCtx1.failed).toHaveBeenCalledOnce();
        expect(logCtx2.failed).toHaveBeenCalledOnce();
        expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), {
            unmappedFailureCount: 2,
            accountId: 1,
            environmentId: 2
        });
    });
});
