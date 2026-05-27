import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

vi.mock('../../env.js', () => ({
    envs: {
        AWS_REGION: undefined
    }
}));

import { DispatchQueueConsumer } from './consumer.js';

import type { SQSClient } from '@aws-sdk/client-sqs';
import type { OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { WebhookDispatchMessage } from '@nangohq/types';

function buildMessage(overrides: Partial<WebhookDispatchMessage> = {}): WebhookDispatchMessage {
    return {
        version: 1,
        kind: 'webhook',
        taskName: 'webhook:abc123',
        createdAt: '2026-04-23T00:00:00.000Z',
        accountId: 1,
        integrationId: 3,
        provider: 'github',
        parentSyncName: 'sync-1',
        activityLogId: 'log-1',
        webhookName: 'push',
        connection: { id: 42, connection_id: 'conn-1', provider_config_key: 'github-dev', environment_id: 2 },
        payload: { hello: 'world' },
        ...overrides
    };
}

function abortError(): Error {
    const error = new Error('aborted');
    error.name = 'AbortError';
    return error;
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

interface Harness {
    consumer: DispatchQueueConsumer;
    sqsSend: ReturnType<typeof vi.fn>;
    sqsDestroy: ReturnType<typeof vi.fn>;
    orchestratorExecuteWebhookBatch: ReturnType<typeof vi.fn>;
}

function makeHarness(
    opts: {
        messages?: WebhookDispatchMessage[];
        badBody?: string;
        consumerConcurrency?: number;
        maxAgeMs?: number;
        sqsSend?: ReturnType<typeof vi.fn>;
    } = {}
): Harness {
    const messages = opts.messages ?? [];
    const bodyQueue: { Body: string; ReceiptHandle: string; Attributes: Record<string, string> }[] = [];
    for (let i = 0; i < messages.length; i++) {
        bodyQueue.push({ Body: JSON.stringify(messages[i]), ReceiptHandle: `rh-${i}`, Attributes: { SentTimestamp: String(Date.now() - 500) } });
    }
    if (opts.badBody !== undefined) {
        bodyQueue.push({ Body: opts.badBody, ReceiptHandle: `rh-bad`, Attributes: { SentTimestamp: String(Date.now()) } });
    }

    const sqsSend =
        opts.sqsSend ??
        vi.fn(async (command: unknown) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (command instanceof ReceiveMessageCommand) {
                const messages = bodyQueue.splice(0, bodyQueue.length);
                return { Messages: messages };
            }
            if (command instanceof DeleteMessageCommand) {
                return {};
            }
            throw new Error(`unexpected command ${String(command)}`);
        });

    const sqsDestroy = vi.fn();
    const sqs = { send: sqsSend, destroy: sqsDestroy } as unknown as SQSClient;

    const orchestratorExecuteWebhookBatch = vi.fn();
    orchestratorExecuteWebhookBatch.mockImplementation((props: unknown[]) =>
        Promise.resolve(Ok(props.map((_, i) => Ok({ taskId: `task-${i}`, retryKey: `rk-${i}` }))))
    );
    const orchestratorClient = { executeWebhookBatch: orchestratorExecuteWebhookBatch } as unknown as OrchestratorClient;

    const consumer = new DispatchQueueConsumer({
        sqs,
        queueUrl: 'http://queue',
        orchestratorClient,
        webhookMaxConcurrency: 500,
        consumerConcurrency: opts.consumerConcurrency ?? 1,
        maxMessages: 10,
        waitTimeSeconds: 0,
        visibilityTimeoutSeconds: 30,
        maxAgeMs: opts.maxAgeMs ?? 0
    });

    return { consumer, sqsSend, sqsDestroy, orchestratorExecuteWebhookBatch };
}

function getDeleteCalls(h: Harness) {
    return h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
}

async function runOnce(h: Harness, waitFor: () => void | Promise<void>): Promise<void> {
    h.consumer.start();
    await vi.waitFor(waitFor);
    await h.consumer.stop();
}

describe('DispatchQueueConsumer', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('sends all received messages in a single executeWebhookBatch call', async () => {
        const msgs = [
            buildMessage({ taskName: 'webhook:1', activityLogId: 'log-1' }),
            buildMessage({ taskName: 'webhook:2', activityLogId: 'log-2' }),
            buildMessage({ taskName: 'webhook:3', activityLogId: 'log-3' })
        ];
        const h = makeHarness({ messages: msgs });

        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(3);
        });

        expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        const calledWith = h.orchestratorExecuteWebhookBatch.mock.calls[0]?.[0];
        expect(calledWith).toHaveLength(3);
        expect(calledWith?.[0]).toMatchObject({
            name: 'webhook:1',
            group: { key: 'webhook:environment:2', maxConcurrency: 500 },
            args: { webhookName: msgs[0]!.webhookName, activityLogId: 'log-1' }
        });
    });

    it('dedupes repeated task names in one receive, scheduling once and deleting every copy', async () => {
        // Standard SQS can redeliver the same message within a single receive.
        const msgs = [buildMessage({ taskName: 'webhook:dup' }), buildMessage({ taskName: 'webhook:dup' }), buildMessage({ taskName: 'webhook:other' })];
        const h = makeHarness({ messages: msgs });

        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(3);
        });

        // The batch sent to the orchestrator collapses the duplicate to a single entry...
        expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        const calledWith = h.orchestratorExecuteWebhookBatch.mock.calls[0]?.[0];
        expect(calledWith).toHaveLength(2);
        expect(calledWith?.map((p: { name: string }) => p.name)).toEqual(['webhook:dup', 'webhook:other']);
        // ...but all three SQS messages (both copies + the other) are deleted on success.
    });

    it('treats duplicate task-name per-entry results as already processed and deletes those messages', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' }), buildMessage({ taskName: 'webhook:2' })];
        const h = makeHarness({ messages: msgs });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Ok({ taskId: 't1', retryKey: 'r1' }), Err({ name: 'duplicate_task_name', message: 'already exists', payload: {} })])
        );

        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(2);
        });

        expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
    });

    it('drops (deletes) messages whose per-entry result is task_cap_exceeded', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' }), buildMessage({ taskName: 'webhook:2' })];
        const h = makeHarness({ messages: msgs });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Ok({ taskId: 't1', retryKey: 'r1' }), Err({ name: 'task_cap_exceeded', message: 'cap', payload: {} })])
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        // A saturated group can't accept the task, so the message is shed (deleted) rather than
        // redelivered — both the successful entry and the capped one get deleted.
        expect(getDeleteCalls(h)).toHaveLength(2);
    });

    it('does not delete messages whose per-entry result is a generic error', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' }), buildMessage({ taskName: 'webhook:2' })];
        const h = makeHarness({ messages: msgs });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Ok({ taskId: 't1', retryKey: 'r1' }), Err({ name: 'server_error', message: 'boom', payload: {} })])
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        // Only the successful entry gets deleted; the generic error is left for redelivery.
        expect(getDeleteCalls(h)).toHaveLength(1);
    });

    it('does not delete or call orchestrator when the entire batch is rejected with a generic error', async () => {
        const h = makeHarness({ messages: [buildMessage()] });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(Err({ name: 'boom', message: 'boom', payload: null }));

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        expect(getDeleteCalls(h)).toHaveLength(0);
    });

    it('deletes a poison-pill message without calling orchestrator', async () => {
        const h = makeHarness({ badBody: 'not-json' });
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhookBatch).not.toHaveBeenCalled();
    });

    it('rejects a schema-invalid message as poison and deletes it', async () => {
        const invalid = { ...buildMessage(), kind: 'wrong' };
        const h = makeHarness({ badBody: JSON.stringify(invalid) });
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhookBatch).not.toHaveBeenCalled();
    });

    it('deletes a stale message without calling orchestrator', async () => {
        const h = makeHarness({ messages: [buildMessage()], maxAgeMs: 100 });
        // SentTimestamp in makeHarness is Date.now() - 500, which exceeds maxAgeMs of 100ms
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhookBatch).not.toHaveBeenCalled();
    });

    it('still deletes successfully scheduled messages during graceful shutdown', async () => {
        const h = makeHarness({ messages: [buildMessage({ taskName: 'webhook:1' })] });
        const gate = deferred<void>();
        h.orchestratorExecuteWebhookBatch.mockImplementationOnce(async (props: unknown[]) => {
            await gate.promise;
            return Ok(props.map((_, i) => Ok({ taskId: `t${i}`, retryKey: `r${i}` })));
        });

        h.consumer.start();
        await vi.waitFor(() => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        // Begin shutdown while the batch is in flight, then let it complete: the in-flight batch
        // must still finish and delete its scheduled message rather than being abandoned.
        const stopPromise = h.consumer.stop();
        gate.resolve();
        await stopPromise;

        expect(getDeleteCalls(h)).toHaveLength(1);
    });

    it('starts one poll loop per configured consumerConcurrency', async () => {
        let receiveCalls = 0;
        const firstReceives = [deferred<void>(), deferred<void>()];
        const sqsSend = vi.fn(async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
            if (command instanceof ReceiveMessageCommand) {
                const index = receiveCalls++;
                const pending = firstReceives[index];
                if (pending) {
                    return await new Promise((resolve, reject) => {
                        const onAbort = () => reject(abortError());
                        options?.abortSignal?.addEventListener('abort', onAbort, { once: true });
                        pending.promise.then(() => resolve({ Messages: [] }), reject);
                    });
                }

                if (options?.abortSignal?.aborted) {
                    throw abortError();
                }
                return { Messages: [] };
            }

            if (command instanceof DeleteMessageCommand) {
                return {};
            }

            throw new Error(`unexpected command ${String(command)}`);
        });

        const h = makeHarness({ consumerConcurrency: 2, sqsSend });
        h.consumer.start();

        await vi.waitFor(() => {
            expect(receiveCalls).toBe(2);
        });

        await h.consumer.stop();
        expect(h.sqsDestroy).toHaveBeenCalledOnce();
    });
});
