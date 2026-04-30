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
    orchestratorExecuteWebhook: ReturnType<typeof vi.fn>;
}

function makeHarness(
    opts: {
        messages?: WebhookDispatchMessage[];
        badBody?: string;
        consumerConcurrency?: number;
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

    const orchestratorExecuteWebhook = vi.fn();
    orchestratorExecuteWebhook.mockResolvedValue(Ok({ taskId: 'task-1', retryKey: 'rk-1' }));
    const orchestratorClient = { executeWebhook: orchestratorExecuteWebhook } as unknown as OrchestratorClient;

    const consumer = new DispatchQueueConsumer({
        sqs,
        queueUrl: 'http://queue',
        orchestratorClient,
        webhookMaxConcurrency: 500,
        consumerConcurrency: opts.consumerConcurrency ?? 1,
        maxMessages: 10,
        waitTimeSeconds: 0,
        visibilityTimeoutSeconds: 30
    });

    return { consumer, sqsSend, sqsDestroy, orchestratorExecuteWebhook };
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

    it('schedules a valid message and deletes it on success', async () => {
        const msg = buildMessage();
        const h = makeHarness({ messages: [msg] });
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhook).toHaveBeenCalledTimes(1);
        const call = h.orchestratorExecuteWebhook.mock.calls[0]?.[0];
        expect(call).toMatchObject({
            name: msg.taskName,
            group: { key: 'webhook:environment:2', maxConcurrency: 500 },
            args: {
                webhookName: msg.webhookName,
                parentSyncName: msg.parentSyncName,
                connection: msg.connection,
                activityLogId: msg.activityLogId,
                input: msg.payload
            }
        });
        const deleteCalls = getDeleteCalls(h);
        expect(deleteCalls).toHaveLength(1);
        expect(h.sqsDestroy).toHaveBeenCalledOnce();
    });

    it('treats duplicate task-name scheduling errors as already processed and deletes the message', async () => {
        const h = makeHarness({ messages: [buildMessage()] });
        h.orchestratorExecuteWebhook.mockResolvedValueOnce(
            Err({
                name: 'duplicate_task_name',
                message: 'Task with name already exists',
                payload: { taskName: 'webhook:abc123' }
            })
        );

        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhook).toHaveBeenCalledTimes(1);
        const deleteCalls = getDeleteCalls(h);
        expect(deleteCalls).toHaveLength(1);
    });

    it('does not delete when orchestrator returns a non-duplicate error', async () => {
        const h = makeHarness({ messages: [buildMessage()] });
        h.orchestratorExecuteWebhook.mockResolvedValueOnce(Err({ name: 'boom', message: 'boom', payload: null }));

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhook).toHaveBeenCalledTimes(1);
        });

        expect(h.orchestratorExecuteWebhook).toHaveBeenCalledTimes(1);
        const deleteCalls = getDeleteCalls(h);
        expect(deleteCalls).toHaveLength(0);
    });

    it('deletes a poison-pill message without calling orchestrator', async () => {
        const h = makeHarness({ badBody: 'not-json' });
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhook).not.toHaveBeenCalled();
        const deleteCalls = getDeleteCalls(h);
        expect(deleteCalls).toHaveLength(1);
    });

    it('treats an empty-body message as a poison pill and deletes it', async () => {
        const h = makeHarness({ badBody: '' });
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhook).not.toHaveBeenCalled();
        const deleteCalls = getDeleteCalls(h);
        expect(deleteCalls).toHaveLength(1);
    });

    it('rejects a schema-invalid message as poison and deletes it', async () => {
        const invalid = { ...buildMessage(), kind: 'wrong' };
        const h = makeHarness({ badBody: JSON.stringify(invalid) });
        await runOnce(h, () => {
            expect(getDeleteCalls(h)).toHaveLength(1);
        });

        expect(h.orchestratorExecuteWebhook).not.toHaveBeenCalled();
        const deleteCalls = getDeleteCalls(h);
        expect(deleteCalls).toHaveLength(1);
    });

    it('still deletes successfully scheduled messages during graceful shutdown', async () => {
        const message = buildMessage();
        const scheduled = deferred<ReturnType<typeof Ok>>();
        let received = false;
        const sqsSend = vi.fn(async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (command instanceof ReceiveMessageCommand) {
                if (!received) {
                    received = true;
                    return {
                        Messages: [{ Body: JSON.stringify(message), ReceiptHandle: 'rh-0', Attributes: { SentTimestamp: String(Date.now() - 500) } }]
                    };
                }

                if (options?.abortSignal?.aborted) {
                    throw abortError();
                }
                return { Messages: [] };
            }

            if (command instanceof DeleteMessageCommand) {
                if (options?.abortSignal?.aborted) {
                    throw abortError();
                }
                return {};
            }

            throw new Error(`unexpected command ${String(command)}`);
        });

        const h = makeHarness({ messages: [message], sqsSend });
        h.orchestratorExecuteWebhook.mockReturnValueOnce(scheduled.promise);

        h.consumer.start();
        await vi.waitFor(() => {
            expect(h.orchestratorExecuteWebhook).toHaveBeenCalledOnce();
        });

        const stopPromise = h.consumer.stop();
        scheduled.resolve(Ok({ taskId: 'task-1', retryKey: 'rk-1' }));
        await stopPromise;

        const deleteCalls = h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0]?.[1]).toBeUndefined();
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
