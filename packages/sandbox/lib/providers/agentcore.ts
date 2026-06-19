import { randomUUID } from 'node:crypto';

import {
    BedrockAgentCoreClient,
    InvokeAgentRuntimeCommand,
    InvokeAgentRuntimeCommandCommand,
    StopRuntimeSessionCommand
} from '@aws-sdk/client-bedrock-agentcore';

import { SandboxCommandExitError, SandboxCommandTimeoutError, SandboxUnavailableError } from './errors.js';
import { envs } from '../env.js';

import type { CreateSandboxParams, Sandbox, SandboxCommandParams, SandboxCommandResult, SandboxFile, SandboxProvider } from './types.js';
import type { InvokeAgentRuntimeCommandStreamOutput } from '@aws-sdk/client-bedrock-agentcore';

type AgentCoreAdapterRequest =
    | { operation: 'init' }
    | { operation: 'writeFiles'; files: SandboxFile[] }
    | { operation: 'readTextFile'; path: string }
    | { operation: 'startCommand'; command: string; timeoutMs: number; envs?: Record<string, string> | undefined };

interface AgentCoreAdapterError {
    message?: string;
    name?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
}

type AgentCoreAdapterResponse<T> = { ok: true; data: T } | { ok: false; error: AgentCoreAdapterError };

const workspacePath = '/home/user/nango-integrations';
const jsonContentType = 'application/json';
const eventStreamAccept = 'application/vnd.amazon.eventstream';
const maxAgentCoreCommandTimeoutSeconds = 3600;
const envNameRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class AgentCoreSandboxProvider implements SandboxProvider {
    public readonly name = 'agentcore';
    private readonly client: BedrockAgentCoreClient;

    constructor(client: BedrockAgentCoreClient = new BedrockAgentCoreClient()) {
        this.client = client;
    }

    async create(params: CreateSandboxParams): Promise<Sandbox> {
        const sandbox = new AgentCoreSandbox({
            id: `nango-${params.purpose}-${randomUUID()}`,
            client: this.client,
            runtimeArn: getRuntimeArn(),
            qualifier: envs.AGENTCORE_RUNTIME_QUALIFIER
        });

        try {
            await sandbox.invokeAdapter('init', { operation: 'init' });
        } catch (err) {
            if (isExecutionEnvironmentUnavailableError(err)) {
                throw new SandboxUnavailableError('Function execution environment unavailable', { cause: err });
            }
            throw err;
        }

        return sandbox;
    }

    async cleanup(sandboxId: string): Promise<void> {
        await this.client.send(
            new StopRuntimeSessionCommand({
                agentRuntimeArn: getRuntimeArn(),
                qualifier: envs.AGENTCORE_RUNTIME_QUALIFIER,
                runtimeSessionId: sandboxId
            })
        );
    }
}

class AgentCoreSandbox implements Sandbox {
    public readonly provider = 'agentcore';
    public readonly id: string;
    private readonly client: BedrockAgentCoreClient;
    private readonly runtimeArn: string;
    private readonly qualifier: string;

    constructor(params: { id: string; client: BedrockAgentCoreClient; runtimeArn: string; qualifier: string }) {
        this.id = params.id;
        this.client = params.client;
        this.runtimeArn = params.runtimeArn;
        this.qualifier = params.qualifier;
    }

    async writeFiles(files: SandboxFile[]): Promise<void> {
        await this.invokeAdapter<void>('writeFiles', { operation: 'writeFiles', files });
    }

    async readTextFile(path: string): Promise<string> {
        return await this.invokeAdapter<string>('readTextFile', { operation: 'readTextFile', path });
    }

    async runCommand(params: SandboxCommandParams): Promise<SandboxCommandResult> {
        const result = await this.client.send(
            new InvokeAgentRuntimeCommandCommand({
                agentRuntimeArn: this.runtimeArn,
                qualifier: this.qualifier,
                runtimeSessionId: this.id,
                contentType: jsonContentType,
                accept: eventStreamAccept,
                body: {
                    command: buildCommand(params),
                    timeout: toAgentCoreTimeoutSeconds(params.timeoutMs)
                }
            })
        );

        return await toSandboxCommandResult(result.stream);
    }

    async startCommand(params: SandboxCommandParams): Promise<void> {
        await this.invokeAdapter<void>('startCommand', {
            operation: 'startCommand',
            command: params.command,
            timeoutMs: params.timeoutMs,
            ...(params.envs !== undefined ? { envs: params.envs } : {})
        });
    }

    async stop(): Promise<void> {
        await this.client.send(
            new StopRuntimeSessionCommand({
                agentRuntimeArn: this.runtimeArn,
                qualifier: this.qualifier,
                runtimeSessionId: this.id
            })
        );
    }

    async invokeAdapter<T>(operation: AgentCoreAdapterRequest['operation'], request: AgentCoreAdapterRequest): Promise<T> {
        const response = await this.client.send(
            new InvokeAgentRuntimeCommand({
                agentRuntimeArn: this.runtimeArn,
                qualifier: this.qualifier,
                runtimeSessionId: this.id,
                contentType: jsonContentType,
                accept: jsonContentType,
                payload: Buffer.from(JSON.stringify(request))
            })
        );

        const text = await readSdkStream(response.response);
        const parsed = parseAdapterResponse<T>(operation, text);
        if (!parsed.ok) {
            throw toAdapterError(operation, parsed.error);
        }

        return parsed.data;
    }
}

function getRuntimeArn(): string {
    if (!envs.AGENTCORE_RUNTIME_ARN) {
        throw new Error('AGENTCORE_RUNTIME_ARN is required for the AgentCore sandbox provider');
    }

    return envs.AGENTCORE_RUNTIME_ARN;
}

function buildCommand(params: SandboxCommandParams): string {
    const cd = `cd ${shellQuote(workspacePath)}`;
    const exports = Object.entries(params.envs ?? {})
        .map(([key, value]) => buildExport(key, value))
        .join('; ');
    const script = [exports, `${cd} && ${params.command}`].filter(Boolean).join('; ');
    return `sh -lc ${shellQuote(script)}`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function buildExport(key: string, value: string): string {
    if (!envNameRegex.test(key)) {
        throw new Error(`Invalid AgentCore environment variable name: ${key}`);
    }

    return `export ${key}=${shellQuote(value)}`;
}

function toAgentCoreTimeoutSeconds(timeoutMs: number): number {
    if (timeoutMs <= 0) {
        return maxAgentCoreCommandTimeoutSeconds;
    }

    return Math.min(Math.max(Math.ceil(timeoutMs / 1000), 1), maxAgentCoreCommandTimeoutSeconds);
}

async function toSandboxCommandResult(stream: AsyncIterable<InvokeAgentRuntimeCommandStreamOutput> | undefined): Promise<SandboxCommandResult> {
    if (!stream) {
        throw new Error('AgentCore command response did not include an event stream');
    }

    let stdout = '';
    let stderr = '';
    let exitCode: number | undefined;
    let status: string | undefined;

    for await (const event of stream) {
        if (event.chunk?.contentDelta?.stdout) {
            stdout += event.chunk.contentDelta.stdout;
        }
        if (event.chunk?.contentDelta?.stderr) {
            stderr += event.chunk.contentDelta.stderr;
        }
        if (event.chunk?.contentStop) {
            exitCode = event.chunk.contentStop.exitCode;
            status = event.chunk.contentStop.status;
        }

        const eventError = getAgentCoreStreamError(event);
        if (eventError) {
            throw eventError;
        }
    }

    if (status === 'TIMED_OUT') {
        throw new SandboxCommandTimeoutError('AgentCore sandbox command timed out');
    }

    if (exitCode === undefined) {
        throw new Error('AgentCore command response did not include a completion event');
    }

    if (exitCode !== 0) {
        throw new SandboxCommandExitError(stderr || stdout || 'AgentCore sandbox command failed', { stdout, stderr, exitCode });
    }

    return { stdout, stderr };
}

function getAgentCoreStreamError(event: InvokeAgentRuntimeCommandStreamOutput): Error | null {
    const error =
        event.accessDeniedException ??
        event.internalServerException ??
        event.resourceNotFoundException ??
        event.runtimeClientError ??
        event.serviceQuotaExceededException ??
        event.throttlingException ??
        event.validationException;

    if (!error) {
        return null;
    }

    const message = 'message' in error && typeof error.message === 'string' ? error.message : 'AgentCore command stream failed';
    return new Error(message);
}

async function readSdkStream(stream: unknown): Promise<string> {
    if (!stream) {
        return '';
    }

    const sdkStream = stream as { transformToString?: () => Promise<string>; transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof sdkStream.transformToString === 'function') {
        return await sdkStream.transformToString();
    }
    if (typeof sdkStream.transformToByteArray === 'function') {
        return Buffer.from(await sdkStream.transformToByteArray()).toString('utf8');
    }
    if (stream instanceof Uint8Array) {
        return Buffer.from(stream).toString('utf8');
    }
    if (typeof stream === 'string') {
        return stream;
    }

    throw new Error('Unsupported AgentCore response stream');
}

function parseAdapterResponse<T>(operation: string, text: string): AgentCoreAdapterResponse<T> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error(`AgentCore adapter returned invalid JSON for ${operation}: ${text}`, { cause: err });
    }

    if (!isRecord(parsed)) {
        throw invalidAdapterResponseError(operation);
    }

    if (parsed['ok'] === true) {
        return { ok: true, data: parsed['data'] as T };
    }

    if (parsed['ok'] === false && isAdapterError(parsed['error'])) {
        return { ok: false, error: parsed['error'] };
    }

    throw invalidAdapterResponseError(operation);
}

function invalidAdapterResponseError(operation: string): Error {
    return new Error(`AgentCore adapter returned invalid response for ${operation}`);
}

function isAdapterError(value: unknown): value is AgentCoreAdapterError {
    return (
        isRecord(value) &&
        optionalString(value['message']) &&
        optionalString(value['name']) &&
        optionalString(value['stdout']) &&
        optionalString(value['stderr']) &&
        optionalNumber(value['exitCode'])
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalString(value: unknown): boolean {
    return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): boolean {
    return value === undefined || typeof value === 'number';
}

function toAdapterError(operation: string, error: AgentCoreAdapterError): Error {
    const message = error.message || `AgentCore adapter ${operation} failed`;
    if (error.name === 'SandboxCommandTimeoutError') {
        return new SandboxCommandTimeoutError(message);
    }
    if (error.name === 'SandboxCommandExitError') {
        return new SandboxCommandExitError(message, {
            stdout: error.stdout,
            stderr: error.stderr,
            exitCode: error.exitCode
        });
    }
    const err = new Error(message);
    err.name = error.name || 'AgentCoreAdapterError';
    return err;
}

function isExecutionEnvironmentUnavailableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const err = error as { name?: unknown; $metadata?: { httpStatusCode?: number } };
    return (
        err.name === 'ThrottlingException' ||
        err.name === 'ThrottledException' ||
        err.name === 'ServiceQuotaExceededException' ||
        err.$metadata?.httpStatusCode === 429
    );
}
