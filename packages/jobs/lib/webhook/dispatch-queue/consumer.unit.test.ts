import { ChangeMessageVisibilityBatchCommand, DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { DispatchQueueConsumer } from './consumer.js';

import type { DispatchCapacityCoordinator } from './capacity-coordinator.js';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { WebhookDispatchMessage } from '@nangohq/types';
import type { Mock } from 'vitest';

const { reportMock } = vi.hoisted(() => ({ reportMock: vi.fn() }));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as Record<string, unknown>), report: reportMock };
});

vi.mock('../../env.js', () => ({
    envs: {
        AWS_REGION: undefined
    }
}));

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

type SqsSendFn = (command: unknown) => Promise<unknown>;
type SqsDestroyFn = () => void;
type OrchestratorExecuteWebhookBatchFn = (props: unknown[]) => Promise<unknown>;

interface Harness {
    consumer: DispatchQueueConsumer;
    sqsSend: Mock<SqsSendFn>;
    sqsDestroy: Mock<SqsDestroyFn>;
    orchestratorExecuteWebhookBatch: Mock<OrchestratorExecuteWebhookBatchFn>;
}

function makeHarness(
    opts: {
        messages?: WebhookDispatchMessage[];
        badBody?: string;
        consumerConcurrency?: number;
        maxAgeMs?: number;
        visibilityTimeoutSeconds?: number;
        sqsSend?: Mock<SqsSendFn>;
        capacityCoordinator?: DispatchCapacityCoordinator;
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

    const sqsSend: Mock<SqsSendFn> =
        opts.sqsSend ??
        vi.fn<SqsSendFn>(async (command: unknown) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (command instanceof ReceiveMessageCommand) {
                const messages = bodyQueue.splice(0, bodyQueue.length);
                return { Messages: messages };
            }
            if (command instanceof DeleteMessageCommand) {
                return {};
            }
            if (command instanceof ChangeMessageVisibilityBatchCommand) {
                return {};
            }
            throw new Error(`unexpected command ${String(command)}`);
        });

    const sqsDestroy = vi.fn<SqsDestroyFn>();
    const sqs = { send: sqsSend, destroy: sqsDestroy } as unknown as SQSClient;

    const orchestratorExecuteWebhookBatch = vi.fn<OrchestratorExecuteWebhookBatchFn>();
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
        visibilityTimeoutSeconds: opts.visibilityTimeoutSeconds ?? 30,
        maxAgeMs: opts.maxAgeMs ?? 0,
        backoffBaseSeconds: 5,
        backoffMaxSeconds: 900,
        ...(opts.capacityCoordinator ? { capacityCoordinator: opts.capacityCoordinator } : {})
    });

    return { consumer, sqsSend, sqsDestroy, orchestratorExecuteWebhookBatch };
}

function getDeleteCalls(h: Harness) {
    return h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
}

function getVisibilityCalls(h: Harness) {
    return h.sqsSend.mock.calls.filter((c) => c[0] instanceof ChangeMessageVisibilityBatchCommand);
}

async function runOnce(h: Harness, waitFor: () => void | Promise<void>): Promise<void> {
    h.consumer.start();
    await vi.waitFor(waitFor);
    await h.consumer.stop();
}

describe('DispatchQueueConsumer', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        reportMock.mockClear();
    });

    it('rejects visibility timeouts too short to heartbeat', () => {
        expect(() => makeHarness({ visibilityTimeoutSeconds: 1 })).toThrow('Webhook dispatch visibility timeout must be at least 2 seconds');
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
        const calledWith = h.orchestratorExecuteWebhookBatch.mock.calls[0]?.[0] as { name: string }[];
        expect(calledWith).toHaveLength(2);
        expect(calledWith.map((p) => p.name)).toEqual(['webhook:dup', 'webhook:other']);
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

    it('defers messages whose per-entry result is task_cap_exceeded', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' }), buildMessage({ taskName: 'webhook:2' })];
        const h = makeHarness({ messages: msgs });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Ok({ taskId: 't1', retryKey: 'r1' }), Err({ name: 'task_cap_exceeded', message: 'cap', payload: {} })])
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        expect(getDeleteCalls(h)).toHaveLength(1);
        expect(getVisibilityCalls(h)).toHaveLength(1);
        const command = getVisibilityCalls(h)[0]?.[0] as ChangeMessageVisibilityBatchCommand;
        expect(command.input.Entries).toEqual([expect.objectContaining({ ReceiptHandle: 'rh-1', VisibilityTimeout: expect.any(Number) })]);
    });

    it('reports details for partial visibility update failures', async () => {
        let delivered = false;
        const sqsSend = vi.fn(async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
            if (command instanceof ReceiveMessageCommand) {
                if (delivered) {
                    return await new Promise((_, reject) => {
                        options?.abortSignal?.addEventListener('abort', () => reject(abortError()), { once: true });
                    });
                }
                delivered = true;
                return {
                    Messages: [
                        {
                            Body: JSON.stringify(buildMessage()),
                            ReceiptHandle: 'sensitive-receipt-handle',
                            Attributes: { SentTimestamp: String(Date.now()), ApproximateReceiveCount: '1' }
                        }
                    ]
                };
            }
            if (command instanceof ChangeMessageVisibilityBatchCommand) {
                return { Failed: [{ Id: '0', Code: 'ReceiptHandleIsInvalid', Message: 'expired', SenderFault: true }] };
            }
            throw new Error(`unexpected command ${String(command)}`);
        }) as Mock<SqsSendFn>;
        const h = makeHarness({ sqsSend });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(Ok([Err({ name: 'task_cap_exceeded', message: 'cap', payload: {} })]));

        await runOnce(h, () => expect(reportMock).toHaveBeenCalledOnce());

        const error = reportMock.mock.calls[0]?.[0] as Error;
        expect(error.message).toContain('ReceiptHandleIsInvalid');
        expect(error.message).toContain('expired');
        expect(error.message).toContain('"senderFault":true');
        expect(error.message).not.toContain('sensitive-receipt-handle');
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

    it('defers the batch and reports congestion when webhook admission is exhausted', async () => {
        const recordCongestion = vi.fn(() => Promise.resolve());
        const coordinator: DispatchCapacityCoordinator = {
            acquire: vi.fn(() => Promise.resolve({ isValid: () => true, release: () => Promise.resolve() })),
            recordSuccess: vi.fn(),
            recordCongestion,
            recordFailure: vi.fn()
        };
        const h = makeHarness({ messages: [buildMessage()], capacityCoordinator: coordinator });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(Err({ name: 'webhook_admission_exceeded', message: 'busy', payload: { retryAfterMs: 2000 } }));

        await runOnce(h, () => expect(recordCongestion).toHaveBeenCalledWith(2000));

        expect(getDeleteCalls(h)).toHaveLength(0);
        expect(getVisibilityCalls(h)).toHaveLength(1);
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

    it('treats a message that fails the orchestrator constraints (non-positive ids) as poison, isolating it', async () => {
        // environment_id=0 would be rejected by the orchestrator batch validation; catching it here
        // as a poison pill keeps it from failing the whole batch.
        const invalid = buildMessage({ connection: { id: 42, connection_id: 'c', provider_config_key: 'p', environment_id: 0 } });
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

    it('extends visibility while orchestrator admission is in flight', async () => {
        const h = makeHarness({ messages: [buildMessage()], visibilityTimeoutSeconds: 2 });
        const gate = deferred<undefined>();
        h.orchestratorExecuteWebhookBatch.mockImplementationOnce(async (props: unknown[]) => {
            await gate.promise;
            return Ok(props.map((_, i) => Ok({ taskId: `t${i}`, retryKey: `r${i}` })));
        });

        h.consumer.start();
        await vi.waitFor(() => expect(getVisibilityCalls(h)).toHaveLength(1), { timeout: 2000 });
        gate.resolve(undefined);
        await vi.waitFor(() => expect(getDeleteCalls(h)).toHaveLength(1));
        await h.consumer.stop();
    });

    it('extends visibility while acknowledgement is in flight', async () => {
        const deleteGate = deferred<undefined>();
        let delivered = false;
        const sqsSend = vi.fn(async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
            if (command instanceof ReceiveMessageCommand) {
                if (delivered) {
                    return await new Promise((_, reject) => {
                        options?.abortSignal?.addEventListener('abort', () => reject(abortError()), { once: true });
                    });
                }
                delivered = true;
                return {
                    Messages: [
                        {
                            Body: JSON.stringify(buildMessage()),
                            ReceiptHandle: 'rh-1',
                            Attributes: { SentTimestamp: String(Date.now()) }
                        }
                    ]
                };
            }
            if (command instanceof DeleteMessageCommand) {
                await deleteGate.promise;
                return {};
            }
            if (command instanceof ChangeMessageVisibilityBatchCommand) {
                return {};
            }
            throw new Error(`unexpected command ${String(command)}`);
        }) as Mock<SqsSendFn>;
        const h = makeHarness({ sqsSend, visibilityTimeoutSeconds: 2 });

        h.consumer.start();
        await vi.waitFor(() => expect(getDeleteCalls(h)).toHaveLength(1));
        await vi.waitFor(() => expect(getVisibilityCalls(h)).toHaveLength(1), { timeout: 2000 });
        deleteGate.resolve(undefined);
        await h.consumer.stop();
    });

    it('still defers task-cap messages when environment congestion feedback fails', async () => {
        const recordEnvironmentCongestion = vi.fn(() => Promise.reject(new Error('Redis unavailable')));
        const coordinator: DispatchCapacityCoordinator = {
            acquire: vi.fn(() => Promise.resolve({ isValid: () => true, release: () => Promise.resolve() })),
            recordSuccess: vi.fn(),
            recordCongestion: vi.fn(),
            recordFailure: vi.fn(),
            recordEnvironmentCongestion
        };
        const h = makeHarness({ messages: [buildMessage()], capacityCoordinator: coordinator });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(Ok([Err({ name: 'task_cap_exceeded', message: 'cap', payload: {} })]));

        await runOnce(h, () => expect(getVisibilityCalls(h)).toHaveLength(1));

        expect(recordEnvironmentCongestion).toHaveBeenCalledOnce();
        expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'webhook dispatch environment congestion feedback failed' }));
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
            if (command instanceof ChangeMessageVisibilityBatchCommand) {
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

    it('holds global capacity from before receive through acknowledgement', async () => {
        const events: string[] = [];
        const release = vi.fn(() => {
            events.push('release');
            return Promise.resolve();
        });
        const coordinator: DispatchCapacityCoordinator = {
            acquire: vi.fn(() => {
                events.push('acquire');
                return Promise.resolve({ isValid: () => true, release });
            }),
            recordSuccess: vi.fn(() => {
                events.push('success');
                return Promise.resolve();
            }),
            recordCongestion: vi.fn(),
            recordFailure: vi.fn()
        };
        let delivered = false;
        const sqsSend = vi.fn(async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
            if (command instanceof ReceiveMessageCommand) {
                if (delivered) {
                    return await new Promise((_, reject) => {
                        options?.abortSignal?.addEventListener('abort', () => reject(abortError()), { once: true });
                    });
                }
                delivered = true;
                events.push('receive');
                return {
                    Messages: [
                        {
                            Body: JSON.stringify(buildMessage()),
                            ReceiptHandle: 'rh-1',
                            Attributes: { SentTimestamp: String(Date.now()) }
                        }
                    ]
                };
            }
            if (command instanceof DeleteMessageCommand) {
                events.push('delete');
                return {};
            }
            if (command instanceof ChangeMessageVisibilityBatchCommand) {
                return {};
            }
            throw new Error(`unexpected command ${String(command)}`);
        }) as Mock<SqsSendFn>;
        const h = makeHarness({ sqsSend, capacityCoordinator: coordinator });

        h.consumer.start();
        await vi.waitFor(() => expect(release).toHaveBeenCalled());
        await h.consumer.stop();

        expect(events.slice(0, 5)).toEqual(['acquire', 'receive', 'delete', 'success', 'release']);
    });

    it('records a capacity failure instead of success when the permit expires during processing', async () => {
        let valid = true;
        const gate = deferred<void>();
        const coordinator: DispatchCapacityCoordinator = {
            acquire: vi.fn(() => Promise.resolve({ isValid: () => valid, release: vi.fn(() => Promise.resolve()) })),
            recordSuccess: vi.fn(),
            recordCongestion: vi.fn(),
            recordFailure: vi.fn(() => Promise.resolve())
        };
        const h = makeHarness({ messages: [buildMessage()], capacityCoordinator: coordinator });
        h.orchestratorExecuteWebhookBatch.mockImplementationOnce(async (props: unknown[]) => {
            await gate.promise;
            return Ok(props.map((_, i) => Ok({ taskId: `task-${i}`, retryKey: `rk-${i}` })));
        });

        h.consumer.start();
        await vi.waitFor(() => expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledOnce());
        valid = false;
        gate.resolve();
        await vi.waitFor(() => expect(coordinator.recordFailure).toHaveBeenCalledOnce());
        await h.consumer.stop();

        expect(coordinator.recordSuccess).not.toHaveBeenCalled();
        expect(getDeleteCalls(h)).toHaveLength(0);
    });

    it('does not dispatch when the permit expires during batch preparation', async () => {
        const isValid = vi
            .fn(() => true)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        const recordFailure = vi.fn(() => Promise.resolve());
        const coordinator: DispatchCapacityCoordinator = {
            acquire: vi.fn(() => Promise.resolve({ isValid, release: vi.fn(() => Promise.resolve()) })),
            recordSuccess: vi.fn(),
            recordCongestion: vi.fn(),
            recordFailure
        };
        const h = makeHarness({ messages: [buildMessage()], capacityCoordinator: coordinator });

        h.consumer.start();
        await vi.waitFor(() => expect(recordFailure).toHaveBeenCalledOnce());
        await h.consumer.stop();

        expect(h.orchestratorExecuteWebhookBatch).not.toHaveBeenCalled();
        expect(getDeleteCalls(h)).toHaveLength(0);
    });

    it('records a capacity failure when batch processing throws', async () => {
        const coordinator: DispatchCapacityCoordinator = {
            acquire: vi.fn(() => Promise.resolve({ isValid: () => true, release: vi.fn(() => Promise.resolve()) })),
            recordSuccess: vi.fn(),
            recordCongestion: vi.fn(),
            recordFailure: vi.fn(() => Promise.resolve())
        };
        const h = makeHarness({ messages: [buildMessage()], capacityCoordinator: coordinator });
        h.orchestratorExecuteWebhookBatch.mockRejectedValueOnce(new Error('orchestrator unavailable'));

        h.consumer.start();
        await vi.waitFor(() => expect(coordinator.recordFailure).toHaveBeenCalledOnce());
        await h.consumer.stop();

        expect(coordinator.recordSuccess).not.toHaveBeenCalled();
    });
});
