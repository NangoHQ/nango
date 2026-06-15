import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const send = vi.fn();
    const envs = {
        AGENTCORE_RUNTIME_ARN: 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/nango-sandbox',
        AGENTCORE_RUNTIME_QUALIFIER: 'DEFAULT',
        AGENTCORE_REGION: 'us-west-2'
    };

    class BedrockAgentCoreClient {
        public readonly config: unknown;

        constructor(config: unknown) {
            this.config = config;
        }

        send(command: unknown): Promise<unknown> {
            return send(command);
        }
    }

    class InvokeAgentRuntimeCommand {
        public readonly input: unknown;

        constructor(input: unknown) {
            this.input = input;
        }
    }

    class InvokeAgentRuntimeCommandCommand {
        public readonly input: unknown;

        constructor(input: unknown) {
            this.input = input;
        }
    }

    class StopRuntimeSessionCommand {
        public readonly input: unknown;

        constructor(input: unknown) {
            this.input = input;
        }
    }

    return { BedrockAgentCoreClient, envs, InvokeAgentRuntimeCommand, InvokeAgentRuntimeCommandCommand, send, StopRuntimeSessionCommand };
});

vi.mock('@aws-sdk/client-bedrock-agentcore', () => ({
    BedrockAgentCoreClient: mocks.BedrockAgentCoreClient,
    InvokeAgentRuntimeCommand: mocks.InvokeAgentRuntimeCommand,
    InvokeAgentRuntimeCommandCommand: mocks.InvokeAgentRuntimeCommandCommand,
    StopRuntimeSessionCommand: mocks.StopRuntimeSessionCommand
}));

vi.mock('../env.js', () => ({ envs: mocks.envs }));

import { AgentCoreSandboxProvider } from './agentcore.js';

function adapterResponse(data?: unknown): { response: { transformToString: () => Promise<string> } } {
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

describe('AgentCoreSandboxProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.envs.AGENTCORE_RUNTIME_ARN = 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/nango-sandbox';
        mocks.envs.AGENTCORE_RUNTIME_QUALIFIER = 'DEFAULT';
        mocks.envs.AGENTCORE_REGION = 'us-west-2';
        mocks.send.mockResolvedValue(adapterResponse());
    });

    it('creates a runtime session by invoking the adapter init operation', async () => {
        const sandbox = await new AgentCoreSandboxProvider().create({ purpose: 'dryrun', timeoutMs: 30_000 });

        expect(sandbox.id).toMatch(/^nango-dryrun-/);
        expect(sandbox.provider).toBe('agentcore');
        expect(mocks.send).toHaveBeenCalledWith(expect.any(mocks.InvokeAgentRuntimeCommand));
        expect((mocks.send.mock.calls[0]![0] as { input: Record<string, unknown> }).input).toMatchObject({
            agentRuntimeArn: mocks.envs.AGENTCORE_RUNTIME_ARN,
            qualifier: 'DEFAULT',
            runtimeSessionId: sandbox.id,
            contentType: 'application/json',
            accept: 'application/json'
        });
        expect(JSON.parse(Buffer.from((mocks.send.mock.calls[0]![0] as { input: { payload: Buffer } }).input.payload).toString('utf8'))).toEqual({
            operation: 'init'
        });
    });

    it('writes and reads files through the runtime adapter', async () => {
        mocks.send.mockResolvedValueOnce(adapterResponse()).mockResolvedValueOnce(adapterResponse()).mockResolvedValueOnce(adapterResponse('compiled'));

        const sandbox = await new AgentCoreSandboxProvider().create({ purpose: 'compile', timeoutMs: 30_000 });
        await sandbox.writeFiles([{ path: 'index.ts', contents: 'export default true;' }]);
        await expect(sandbox.readTextFile('build/index.cjs')).resolves.toBe('compiled');

        expect(JSON.parse(Buffer.from((mocks.send.mock.calls[1]![0] as { input: { payload: Buffer } }).input.payload).toString('utf8'))).toEqual({
            operation: 'writeFiles',
            files: [{ path: 'index.ts', contents: 'export default true;' }]
        });
        expect(JSON.parse(Buffer.from((mocks.send.mock.calls[2]![0] as { input: { payload: Buffer } }).input.payload).toString('utf8'))).toEqual({
            operation: 'readTextFile',
            path: 'build/index.cjs'
        });
    });

    it('starts async commands through the runtime adapter', async () => {
        mocks.send.mockResolvedValueOnce(adapterResponse()).mockResolvedValueOnce(adapterResponse());

        const sandbox = await new AgentCoreSandboxProvider().create({ purpose: 'deploy', timeoutMs: 30_000 });
        await sandbox.startCommand({ command: 'node /tmp/deploy.mjs', timeoutMs: 0, envs: { NO_COLOR: '1' } });

        expect(JSON.parse(Buffer.from((mocks.send.mock.calls[1]![0] as { input: { payload: Buffer } }).input.payload).toString('utf8'))).toEqual({
            operation: 'startCommand',
            command: 'node /tmp/deploy.mjs',
            timeoutMs: 0,
            envs: { NO_COLOR: '1' }
        });
    });

    it('runs synchronous commands with AgentCore command streaming', async () => {
        mocks.send.mockResolvedValueOnce(adapterResponse()).mockResolvedValueOnce({
            stream: commandStream([
                { chunk: { contentDelta: { stdout: 'hello ' } } },
                { chunk: { contentDelta: { stderr: 'warn' } } },
                { chunk: { contentDelta: { stdout: 'world' } } },
                { chunk: { contentStop: { exitCode: 0, status: 'COMPLETED' } } }
            ])
        });

        const sandbox = await new AgentCoreSandboxProvider().create({ purpose: 'compile', timeoutMs: 30_000 });
        const result = await sandbox.runCommand({ command: 'nango compile', timeoutMs: 12_300, envs: { NO_COLOR: '1' } });

        expect(result).toEqual({ stdout: 'hello world', stderr: 'warn' });
        expect(mocks.send).toHaveBeenLastCalledWith(expect.any(mocks.InvokeAgentRuntimeCommandCommand));
        expect((mocks.send.mock.calls[1]![0] as { input: Record<string, unknown> }).input).toMatchObject({
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
        mocks.send.mockResolvedValueOnce(adapterResponse()).mockResolvedValueOnce({
            stream: commandStream([
                { chunk: { contentDelta: { stdout: 'compile stdout' } } },
                { chunk: { contentDelta: { stderr: 'compile stderr' } } },
                { chunk: { contentStop: { exitCode: 2, status: 'COMPLETED' } } }
            ])
        });

        const sandbox = await new AgentCoreSandboxProvider().create({ purpose: 'compile', timeoutMs: 30_000 });

        await expect(sandbox.runCommand({ command: 'nango compile', timeoutMs: 10_000 })).rejects.toMatchObject({
            name: 'SandboxCommandExitError',
            stdout: 'compile stdout',
            stderr: 'compile stderr',
            exitCode: 2
        });
    });

    it('maps timed out command streams to SandboxCommandTimeoutError', async () => {
        mocks.send.mockResolvedValueOnce(adapterResponse()).mockResolvedValueOnce({
            stream: commandStream([{ chunk: { contentStop: { exitCode: -1, status: 'TIMED_OUT' } } }])
        });

        const sandbox = await new AgentCoreSandboxProvider().create({ purpose: 'compile', timeoutMs: 30_000 });

        await expect(sandbox.runCommand({ command: 'nango compile', timeoutMs: 10_000 })).rejects.toMatchObject({
            name: 'SandboxCommandTimeoutError'
        });
    });

    it('stops runtime sessions for cleanup', async () => {
        await new AgentCoreSandboxProvider().cleanup('nango-dryrun-00000000-0000-4000-8000-000000000000');

        expect(mocks.send).toHaveBeenCalledWith(expect.any(mocks.StopRuntimeSessionCommand));
        expect((mocks.send.mock.calls[0]![0] as { input: Record<string, unknown> }).input).toMatchObject({
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
