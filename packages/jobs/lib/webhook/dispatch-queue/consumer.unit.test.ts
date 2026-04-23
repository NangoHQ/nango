import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

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
        ingressRequestId: 'req-1',
        accountId: 1,
        environmentId: 2,
        integrationId: 3,
        provider: 'github',
        providerConfigKey: 'github-dev',
        parentSyncName: 'sync-1',
        activityLogId: 'log-1',
        webhookName: 'push',
        connection: { id: 42, connection_id: 'conn-1', provider_config_key: 'github-dev', environment_id: 2 },
        payload: { hello: 'world' },
        ...overrides
    };
}

interface Harness {
    consumer: DispatchQueueConsumer;
    sqsSend: ReturnType<typeof vi.fn>;
    orchestratorClient: OrchestratorClient;
    orchestratorImmediate: ReturnType<typeof vi.fn>;
}

function makeHarness(opts: { messages?: WebhookDispatchMessage[]; badBody?: string }): Harness {
    const messages = opts.messages ?? [];
    const bodyQueue: { Body: string; ReceiptHandle: string; Attributes: Record<string, string> }[] = [];
    for (let i = 0; i < messages.length; i++) {
        bodyQueue.push({ Body: JSON.stringify(messages[i]), ReceiptHandle: `rh-${i}`, Attributes: { SentTimestamp: String(Date.now() - 500) } });
    }
    if (opts.badBody !== undefined) {
        bodyQueue.push({ Body: opts.badBody, ReceiptHandle: `rh-bad`, Attributes: { SentTimestamp: String(Date.now()) } });
    }

    const sqsSend = vi.fn();
    let firstReceive = true;
    sqsSend.mockImplementation(async (command: unknown) => {
        // Yield a macrotask so the loop doesn't monopolize the event loop after stop() sets abort.
        await new Promise((resolve) => setImmediate(resolve));
        if (command instanceof ReceiveMessageCommand) {
            if (firstReceive) {
                firstReceive = false;
                return { Messages: bodyQueue };
            }
            return { Messages: [] };
        }
        if (command instanceof DeleteMessageCommand) {
            return {};
        }
        throw new Error(`unexpected command ${String(command)}`);
    });

    const sqs = { send: sqsSend, destroy: vi.fn() } as unknown as SQSClient;

    const orchestratorImmediate = vi.fn();
    orchestratorImmediate.mockResolvedValue(Ok({ taskId: 'task-1', retryKey: 'rk-1' }));
    const orchestratorClient = { immediate: orchestratorImmediate } as unknown as OrchestratorClient;

    const consumer = new DispatchQueueConsumer({
        sqs,
        queueUrl: 'http://queue',
        orchestratorClient,
        webhookMaxConcurrency: 500,
        maxMessages: 10,
        waitTimeSeconds: 0,
        visibilityTimeoutSeconds: 30
    });

    return { consumer, sqsSend, orchestratorClient, orchestratorImmediate };
}

async function runOnce(h: Harness): Promise<void> {
    h.consumer.start();
    // Let the loop process one receive tick.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await h.consumer.stop();
}

describe('DispatchQueueConsumer', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('schedules a valid message and deletes it on success', async () => {
        const msg = buildMessage();
        const h = makeHarness({ messages: [msg] });
        await runOnce(h);

        expect(h.orchestratorImmediate).toHaveBeenCalledTimes(1);
        const call = h.orchestratorImmediate.mock.calls[0]?.[0];
        expect(call).toMatchObject({
            name: msg.taskName,
            group: { key: 'webhook:environment:2', maxConcurrency: 500 },
            args: {
                type: 'webhook',
                webhookName: msg.webhookName,
                parentSyncName: msg.parentSyncName,
                connection: msg.connection,
                activityLogId: msg.activityLogId,
                input: msg.payload
            }
        });
        const deleteCalls = h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(1);
    });

    it('does not delete when orchestrator returns an error', async () => {
        const h = makeHarness({ messages: [buildMessage()] });
        h.orchestratorImmediate.mockResolvedValueOnce(Err({ name: 'boom', message: 'boom', payload: null }));

        await runOnce(h);

        expect(h.orchestratorImmediate).toHaveBeenCalledTimes(1);
        const deleteCalls = h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(0);
    });

    it('deletes a poison-pill message without calling orchestrator', async () => {
        const h = makeHarness({ badBody: 'not-json' });
        await runOnce(h);

        expect(h.orchestratorImmediate).not.toHaveBeenCalled();
        const deleteCalls = h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(1);
    });

    it('rejects a schema-invalid message as poison and deletes it', async () => {
        const invalid = { ...buildMessage(), kind: 'wrong' };
        const h = makeHarness({ badBody: JSON.stringify(invalid) });
        await runOnce(h);

        expect(h.orchestratorImmediate).not.toHaveBeenCalled();
        const deleteCalls = h.sqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(1);
    });
});
