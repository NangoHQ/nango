import { ChangeMessageVisibilityBatchCommand, DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, metrics, Ok } from '@nangohq/utils';

import { DispatchQueueConsumer } from './consumer.js';

import type { SQSClient } from '@aws-sdk/client-sqs';
import type { OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { WebhookDispatchMessage } from '@nangohq/types';
import type { Mock } from 'vitest';

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
        rateLimitThrottleMaxMs?: number;
        deferJitterRatio?: number;
        taskCapDeferMs?: number;
        maxVisibilityExtensionMs?: number;
        sqsSend?: Mock<SqsSendFn>;
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
            if (command instanceof DeleteMessageCommand || command instanceof ChangeMessageVisibilityBatchCommand) {
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
        visibilityTimeoutSeconds: 30,
        maxAgeMs: opts.maxAgeMs ?? 0,
        rateLimitThrottleMaxMs: opts.rateLimitThrottleMaxMs ?? 0,
        deferJitterRatio: opts.deferJitterRatio ?? 0,
        taskCapDeferMs: opts.taskCapDeferMs ?? 30_000,
        maxVisibilityExtensionMs: opts.maxVisibilityExtensionMs ?? 0
    });

    return { consumer, sqsSend, sqsDestroy, orchestratorExecuteWebhookBatch };
}

function getVisibilityCalls(h: Harness) {
    return h.sqsSend.mock.calls
        .filter((c) => c[0] instanceof ChangeMessageVisibilityBatchCommand)
        .flatMap((c) => (c[0] as ChangeMessageVisibilityBatchCommand).input.Entries ?? []);
}

function getDeleteCalls(h: Harness) {
    return h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
}

function getDeletedHandles(h: Harness) {
    return getDeleteCalls(h)
        .map((c) => (c[0] as DeleteMessageCommand).input.ReceiptHandle)
        .sort();
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

    it('defers rather than drops messages whose per-entry result is task_cap_exceeded', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' }), buildMessage({ taskName: 'webhook:2' })];
        const h = makeHarness({ messages: msgs, taskCapDeferMs: 30_000 });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Ok({ taskId: 't1', retryKey: 'r1' }), Err({ name: 'task_cap_exceeded', message: 'cap', payload: {} })])
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        // The group drains eventually, so the capped message is held back instead of thrown away.
        // Only the successful entry is deleted, and filterMessages sheds the other once it ages out.
        expect(getDeleteCalls(h)).toHaveLength(1);
        expect(getVisibilityCalls(h)).toEqual([{ Id: '0', ReceiptHandle: 'rh-1', VisibilityTimeout: 30 }]);
    });

    it('keeps messages whose per-entry result is rate_limit_exceeded for redelivery', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' }), buildMessage({ taskName: 'webhook:2' })];
        const h = makeHarness({ messages: msgs });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Ok({ taskId: 't1', retryKey: 'r1' }), Err({ name: 'rate_limit_exceeded', message: 'Rate limit exceeded', payload: { retryAfterMs: 1000 } })])
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        // The environment is over its cap, so the throttled message is left for redelivery.
        // Only the successful entry is deleted.
        expect(getDeleteCalls(h)).toHaveLength(1);
        expect(getVisibilityCalls(h)).toHaveLength(0);
    });

    it('defers rate limited messages to the end of the group throttle', async () => {
        const msgs = [buildMessage({ taskName: 'webhook:1' })];
        const h = makeHarness({ messages: msgs, rateLimitThrottleMaxMs: 60_000 });
        h.orchestratorExecuteWebhookBatch.mockResolvedValueOnce(
            Ok([Err({ name: 'rate_limit_exceeded', message: 'Rate limit exceeded', payload: { retryAfterMs: 30_000 } })])
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(1);
        });

        // Held for the throttle instead of coming back on the 30s visibility timeout and
        // burning a receive attempt for nothing.
        expect(getVisibilityCalls(h)).toEqual([{ Id: '0', ReceiptHandle: 'rh-0', VisibilityTimeout: 30 }]);
        expect(getDeleteCalls(h)).toHaveLength(0);
    });

    it('throttles only the rate limited group and keeps the other groups flowing', async () => {
        const noisy = (n: number) =>
            buildMessage({
                taskName: `webhook:noisy:${n}`,
                connection: { id: 42, connection_id: 'noisy-1', provider_config_key: 'github-noisy', environment_id: 2 }
            });
        const quiet = (n: number) =>
            buildMessage({
                taskName: `webhook:quiet:${n}`,
                connection: { id: 43, connection_id: 'quiet-1', provider_config_key: 'github-quiet', environment_id: 3 }
            });

        const rounds = [
            [noisy(1), quiet(1)],
            [noisy(2), quiet(2)]
        ];
        const sqsSend = vi.fn<SqsSendFn>(async (command: unknown) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (command instanceof ReceiveMessageCommand) {
                const round = rounds.shift() ?? [];
                return {
                    Messages: round.map((m) => ({
                        Body: JSON.stringify(m),
                        ReceiptHandle: `rh-${m.taskName}`,
                        Attributes: { SentTimestamp: String(Date.now()) }
                    }))
                };
            }
            if (command instanceof DeleteMessageCommand || command instanceof ChangeMessageVisibilityBatchCommand) {
                return {};
            }
            throw new Error(`unexpected command ${String(command)}`);
        });

        const h = makeHarness({ sqsSend, rateLimitThrottleMaxMs: 60_000 });
        h.orchestratorExecuteWebhookBatch.mockImplementation((props: unknown[]) =>
            Promise.resolve(
                Ok(
                    (props as { name: string }[]).map((p) =>
                        p.name.startsWith('webhook:noisy')
                            ? Err({ name: 'rate_limit_exceeded', message: 'Rate limit exceeded', payload: { retryAfterMs: 30_000 } })
                            : Ok({ taskId: p.name, retryKey: 'rk' })
                    )
                )
            )
        );

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(2);
        });

        // The quiet group is dispatched right away instead of waiting out the noisy group's 30s.
        const secondBatch = h.orchestratorExecuteWebhookBatch.mock.calls[1]?.[0] as { name: string }[];
        expect(secondBatch.map((p) => p.name)).toEqual(['webhook:quiet:2']);

        expect(getDeletedHandles(h)).toEqual(['rh-webhook:quiet:1', 'rh-webhook:quiet:2']);

        // Both noisy messages are held back, the first by its own throttle and the second by
        // the throttle window that opened, so neither burns a receive attempt on the way back.
        expect(getVisibilityCalls(h).map((e) => e.ReceiptHandle)).toEqual(['rh-webhook:noisy:1', 'rh-webhook:noisy:2']);
    });

    it('does not wait for cooling-group deferrals before dispatching active groups', async () => {
        const noisy = (n: number) =>
            buildMessage({
                taskName: `webhook:noisy:${n}`,
                connection: { id: 42, connection_id: 'noisy-1', provider_config_key: 'github-noisy', environment_id: 2 }
            });
        const quiet = buildMessage({
            taskName: 'webhook:quiet',
            connection: { id: 43, connection_id: 'quiet-1', provider_config_key: 'github-quiet', environment_id: 3 }
        });
        const rounds = [[noisy(1)], [noisy(2), quiet]];
        const deferral = deferred<undefined>();
        const deferralStarted = deferred<undefined>();
        const sqsSend = vi.fn<SqsSendFn>(async (command: unknown) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (command instanceof ReceiveMessageCommand) {
                const round = rounds.shift() ?? [];
                return {
                    Messages: round.map((message) => ({
                        Body: JSON.stringify(message),
                        ReceiptHandle: `rh-${message.taskName}`,
                        Attributes: { SentTimestamp: String(Date.now()) }
                    }))
                };
            }
            if (command instanceof ChangeMessageVisibilityBatchCommand) {
                const handles = command.input.Entries?.map((entry) => entry.ReceiptHandle) ?? [];
                if (handles.includes('rh-webhook:noisy:2')) {
                    deferralStarted.resolve(undefined);
                    await deferral.promise;
                }
                return {};
            }
            if (command instanceof DeleteMessageCommand) {
                return {};
            }
            throw new Error(`unexpected command ${String(command)}`);
        });

        const h = makeHarness({ sqsSend, rateLimitThrottleMaxMs: 60_000 });
        h.orchestratorExecuteWebhookBatch
            .mockResolvedValueOnce(Ok([Err({ name: 'rate_limit_exceeded', message: 'Rate limit exceeded', payload: { retryAfterMs: 30_000 } })]))
            .mockResolvedValueOnce(Ok([Ok({ taskId: 'quiet', retryKey: 'quiet' })]));

        h.consumer.start();
        await deferralStarted.promise;
        await vi.waitFor(() => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(2);
        });
        deferral.resolve(undefined);
        await h.consumer.stop();
    });

    it('counts only the dispatched messages when the whole batch call fails', async () => {
        const cooling = buildMessage({
            taskName: 'webhook:cooling',
            connection: { id: 42, connection_id: 'noisy-1', provider_config_key: 'github-noisy', environment_id: 2 }
        });
        const active = buildMessage({
            taskName: 'webhook:active',
            connection: { id: 43, connection_id: 'quiet-1', provider_config_key: 'github-quiet', environment_id: 3 }
        });

        const rounds = [[cooling], [cooling, active]];
        const sqsSend = vi.fn<SqsSendFn>(async (command: unknown) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (command instanceof ReceiveMessageCommand) {
                const round = rounds.shift() ?? [];
                return {
                    Messages: round.map((m) => ({
                        Body: JSON.stringify(m),
                        ReceiptHandle: `rh-${m.taskName}`,
                        Attributes: { SentTimestamp: String(Date.now()) }
                    }))
                };
            }
            return {};
        });

        const h = makeHarness({ sqsSend, rateLimitThrottleMaxMs: 60_000 });
        h.orchestratorExecuteWebhookBatch
            .mockResolvedValueOnce(Ok([Err({ name: 'rate_limit_exceeded', message: 'Rate limit exceeded', payload: { retryAfterMs: 30_000 } })]))
            .mockResolvedValueOnce(Err({ name: 'immediate_batch_failed', message: 'boom', payload: {} }));
        const increment = vi.spyOn(metrics, 'increment');

        await runOnce(h, () => {
            expect(h.orchestratorExecuteWebhookBatch).toHaveBeenCalledTimes(2);
        });

        // Round two carried one cooling-down message and one dispatched message. Only the
        // dispatched one can have failed, the other was never submitted.
        const failures = increment.mock.calls.filter((c) => c[2]?.['result'] === 'failure');
        expect(failures).toHaveLength(1);
        expect(failures[0]?.[1]).toBe(1);
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
