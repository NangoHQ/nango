import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentCoreSandboxProvider } from './agentcore.js';

import type { SandboxPurpose } from './types.js';

const mocks = vi.hoisted(() => {
    const defaults = {
        runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/nango-sandbox',
        runtimeQualifier: 'DEFAULT',
        runtimeRegion: 'us-east-1'
    };
    const send = vi.fn();
    const envs = {
        AGENTCORE_RUNTIME_ARN: defaults.runtimeArn,
        AGENTCORE_RUNTIME_QUALIFIER: defaults.runtimeQualifier,
        AGENTCORE_REGION: defaults.runtimeRegion
    };

    class AwsCommand {
        public readonly input: unknown;

        constructor(input: unknown) {
            this.input = input;
        }
    }

    class BedrockAgentCoreClient {
        public readonly config: unknown;

        constructor(config: unknown) {
            this.config = config;
        }

        send(command: unknown): Promise<unknown> {
            return send(command);
        }
    }

    class InvokeAgentRuntimeCommand extends AwsCommand {}
    class InvokeAgentRuntimeCommandCommand extends AwsCommand {}
    class StopRuntimeSessionCommand extends AwsCommand {}

    return { BedrockAgentCoreClient, defaults, envs, InvokeAgentRuntimeCommand, InvokeAgentRuntimeCommandCommand, send, StopRuntimeSessionCommand };
});

vi.mock('@aws-sdk/client-bedrock-agentcore', () => ({
    BedrockAgentCoreClient: mocks.BedrockAgentCoreClient,
    InvokeAgentRuntimeCommand: mocks.InvokeAgentRuntimeCommand,
    InvokeAgentRuntimeCommandCommand: mocks.InvokeAgentRuntimeCommandCommand,
    StopRuntimeSessionCommand: mocks.StopRuntimeSessionCommand
}));

vi.mock('../env.js', () => ({ envs: mocks.envs }));

interface AdapterSdkResponse {
    response: { transformToString: () => Promise<string> };
}

function adapterResponse(data?: unknown): AdapterSdkResponse {
    return {
        response: {
            transformToString: () => Promise.resolve(JSON.stringify({ ok: true, data }))
        }
    };
}

async function* commandStream(events: unknown[]): AsyncGenerator {
    await Promise.resolve();
    for (const event of events) {
        yield event;
    }
}

async function createSandbox(purpose: SandboxPurpose) {
    mocks.send.mockResolvedValueOnce(adapterResponse());
    return await new AgentCoreSandboxProvider().create({ purpose, timeoutMs: 30_000 });
}

function resetAgentCoreEnv(): void {
    mocks.envs.AGENTCORE_RUNTIME_ARN = mocks.defaults.runtimeArn;
    mocks.envs.AGENTCORE_RUNTIME_QUALIFIER = mocks.defaults.runtimeQualifier;
    mocks.envs.AGENTCORE_REGION = mocks.defaults.runtimeRegion;
}

function sentInputAt(index: number): Record<string, unknown> {
    const command = mocks.send.mock.calls[index]?.[0] as { input?: unknown } | undefined;
    if (!command || !command.input || typeof command.input !== 'object') {
        throw new Error(`Missing AWS command input at call ${index}`);
    }

    return command.input as Record<string, unknown>;
}

function lastSentInput(): Record<string, unknown> {
    return sentInputAt(mocks.send.mock.calls.length - 1);
}

function lastAdapterPayload(): unknown {
    const input = lastSentInput() as { payload?: Buffer };
    if (!input.payload) {
        throw new Error('Last AWS command did not include an adapter payload');
    }

    return JSON.parse(Buffer.from(input.payload).toString('utf8'));
}

describe('AgentCoreSandboxProvider', () => {
    beforeEach(() => {
        mocks.send.mockReset();
        resetAgentCoreEnv();
    });

    it('creates a runtime session by invoking the adapter init operation', async () => {
        const sandbox = await createSandbox('dryrun');

        expect(sandbox.id).toMatch(/^nango-dryrun-/);
        expect(sandbox.provider).toBe('agentcore');
        expect(mocks.send).toHaveBeenCalledWith(expect.any(mocks.InvokeAgentRuntimeCommand));
        expect(lastSentInput()).toMatchObject({
            agentRuntimeArn: mocks.envs.AGENTCORE_RUNTIME_ARN,
            qualifier: 'DEFAULT',
            runtimeSessionId: sandbox.id,
            contentType: 'application/json',
            accept: 'application/json'
        });
        expect(lastAdapterPayload()).toEqual({ operation: 'init' });
    });

    it('writes and reads files through the runtime adapter', async () => {
        const sandbox = await createSandbox('compile');

        mocks.send.mockResolvedValueOnce(adapterResponse());
        await sandbox.writeFiles([{ path: 'index.ts', contents: 'export default true;' }]);
        expect(lastAdapterPayload()).toEqual({
            operation: 'writeFiles',
            files: [{ path: 'index.ts', contents: 'export default true;' }]
        });

        mocks.send.mockResolvedValueOnce(adapterResponse('compiled'));
        await expect(sandbox.readTextFile('build/index.cjs')).resolves.toBe('compiled');
        expect(lastAdapterPayload()).toEqual({
            operation: 'readTextFile',
            path: 'build/index.cjs'
        });
    });

    it('starts async commands through the runtime adapter', async () => {
        const sandbox = await createSandbox('deploy');

        mocks.send.mockResolvedValueOnce(adapterResponse());
        await sandbox.startCommand({ command: 'node .nango/runtime/deploy.mjs', timeoutMs: 0, envs: { NO_COLOR: '1' } });

        expect(lastAdapterPayload()).toEqual({
            operation: 'startCommand',
            command: 'node .nango/runtime/deploy.mjs',
            timeoutMs: 0,
            envs: { NO_COLOR: '1' }
        });
    });

    it('runs synchronous commands with AgentCore command streaming', async () => {
        const sandbox = await createSandbox('compile');
        mocks.send.mockResolvedValueOnce({
            stream: commandStream([
                { chunk: { contentDelta: { stdout: 'hello ' } } },
                { chunk: { contentDelta: { stderr: 'warn' } } },
                { chunk: { contentDelta: { stdout: 'world' } } },
                { chunk: { contentStop: { exitCode: 0, status: 'COMPLETED' } } }
            ])
        });

        const result = await sandbox.runCommand({ command: 'nango compile', timeoutMs: 12_300, envs: { NO_COLOR: '1' } });

        expect(result).toEqual({ stdout: 'hello world', stderr: 'warn' });
        expect(mocks.send).toHaveBeenLastCalledWith(expect.any(mocks.InvokeAgentRuntimeCommandCommand));
        expect(lastSentInput()).toMatchObject({
            agentRuntimeArn: mocks.envs.AGENTCORE_RUNTIME_ARN,
            qualifier: 'DEFAULT',
            runtimeSessionId: sandbox.id,
            contentType: 'application/json',
            accept: 'application/vnd.amazon.eventstream',
            body: {
                command: "sh -lc 'export NO_COLOR='\"'\"'1'\"'\"'; cd '\"'\"'/home/user/nango-integrations'\"'\"' && nango compile'",
                timeout: 13
            }
        });
    });

    it('maps non-zero command exits to SandboxCommandExitError', async () => {
        const sandbox = await createSandbox('compile');
        mocks.send.mockResolvedValueOnce({
            stream: commandStream([
                { chunk: { contentDelta: { stdout: 'compile stdout' } } },
                { chunk: { contentDelta: { stderr: 'compile stderr' } } },
                { chunk: { contentStop: { exitCode: 2, status: 'COMPLETED' } } }
            ])
        });

        await expect(sandbox.runCommand({ command: 'nango compile', timeoutMs: 10_000 })).rejects.toMatchObject({
            name: 'SandboxCommandExitError',
            stdout: 'compile stdout',
            stderr: 'compile stderr',
            exitCode: 2
        });
    });

    it('maps timed out command streams to SandboxCommandTimeoutError', async () => {
        const sandbox = await createSandbox('compile');
        mocks.send.mockResolvedValueOnce({ stream: commandStream([{ chunk: { contentStop: { exitCode: -1, status: 'TIMED_OUT' } } }]) });

        await expect(sandbox.runCommand({ command: 'nango compile', timeoutMs: 10_000 })).rejects.toMatchObject({
            name: 'SandboxCommandTimeoutError'
        });
    });

    it('stops runtime sessions for cleanup', async () => {
        mocks.send.mockResolvedValueOnce({});

        await new AgentCoreSandboxProvider().cleanup('nango-dryrun-00000000-0000-4000-8000-000000000000');

        expect(mocks.send).toHaveBeenCalledWith(expect.any(mocks.StopRuntimeSessionCommand));
        expect(lastSentInput()).toMatchObject({
            agentRuntimeArn: mocks.envs.AGENTCORE_RUNTIME_ARN,
            qualifier: 'DEFAULT',
            runtimeSessionId: 'nango-dryrun-00000000-0000-4000-8000-000000000000'
        });
    });

    it('normalizes AgentCore capacity errors to SandboxUnavailableError during create', async () => {
        const error = Object.assign(new Error('Rate limit exceeded'), { name: 'ThrottlingException', $metadata: { httpStatusCode: 429 } });
        mocks.send.mockRejectedValueOnce(error);

        await expect(new AgentCoreSandboxProvider().create({ purpose: 'dryrun', timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'SandboxUnavailableError',
            cause: error
        });
    });
});
