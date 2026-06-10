import { randomUUID } from 'node:crypto';
import { posix as path } from 'node:path';

import { CommandExitError, RateLimitError, Sandbox as E2B, TimeoutError } from 'e2b';

import { getLogger, stringifyError } from '@nangohq/utils';

import { SandboxCommandExitError, SandboxCommandTimeoutError, SandboxUnavailableError } from './errors.js';
import { envs } from '../env.js';

import type { CleanupSandboxParams, CreateSandboxParams, Sandbox, SandboxCommandParams, SandboxCommandResult, SandboxFile, SandboxProvider } from './types.js';
import type { SandboxListOpts } from 'e2b';

type E2BRawSandbox = Awaited<ReturnType<typeof E2B.create>>;

const logger = getLogger('E2BSandboxProvider');
const template = envs.E2B_SANDBOX_COMPILER_TEMPLATE;
const workspacePath = '/home/user/nango-integrations';

export class E2BSandboxProvider implements SandboxProvider {
    public readonly name = 'e2b';

    async create(params: CreateSandboxParams): Promise<Sandbox> {
        const apiKey = envs.E2B_API_KEY;
        if (!apiKey) {
            throw new Error(`E2B_API_KEY is required for the E2B ${params.purpose} runtime`);
        }

        try {
            const sandbox = await E2B.create(template, {
                timeoutMs: params.timeoutMs,
                allowInternetAccess: true,
                metadata: { ...params.metadata, purpose: params.purpose, requestId: randomUUID() },
                network: { allowPublicTraffic: true },
                apiKey
            });

            return new E2BSandbox(sandbox);
        } catch (err) {
            if (isExecutionEnvironmentUnavailableError(err)) {
                throw new SandboxUnavailableError('Function execution environment unavailable', { cause: err });
            }

            throw err;
        }
    }

    async cleanup({ sandboxId, apiKey = envs.E2B_API_KEY }: CleanupSandboxParams): Promise<void> {
        if (!apiKey) {
            logger.warning('Skipping sandbox cleanup because E2B_API_KEY is not set', { sandboxId });
            return;
        }

        await E2B.kill(sandboxId, { apiKey });
    }
}

class E2BSandbox implements Sandbox {
    public readonly provider = 'e2b';

    constructor(private readonly sandbox: E2BRawSandbox) {}

    get id(): string {
        return this.sandbox.sandboxId;
    }

    async writeFiles(files: SandboxFile[]): Promise<void> {
        for (const file of files) {
            await this.sandbox.files.write(resolvePath(file.path), file.contents);
        }
    }

    async readTextFile(filePath: string): Promise<string> {
        return String(await this.sandbox.files.read(resolvePath(filePath)));
    }

    async runCommand(params: SandboxCommandParams): Promise<SandboxCommandResult> {
        try {
            const result = await this.sandbox.commands.run(params.command, {
                cwd: resolvePath(params.cwd),
                timeoutMs: params.timeoutMs,
                ...(params.envs !== undefined ? { envs: params.envs } : {})
            });

            return { stdout: result.stdout, stderr: result.stderr };
        } catch (err) {
            throw toSandboxCommandError(err);
        }
    }

    async startCommand(params: SandboxCommandParams): Promise<void> {
        try {
            await this.sandbox.commands.run(params.command, {
                cwd: resolvePath(params.cwd),
                background: true,
                timeoutMs: params.timeoutMs,
                ...(params.envs !== undefined ? { envs: params.envs } : {})
            });
        } catch (err) {
            throw toSandboxCommandError(err);
        }
    }

    async stop(): Promise<void> {
        await this.sandbox.kill();
    }
}

export async function getRunningE2BSandboxCount({ apiKey, requestTimeoutMs }: { apiKey: string; requestTimeoutMs?: number | undefined }): Promise<number> {
    const listOptions = {
        apiKey,
        ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
        query: { state: ['running'] }
    } satisfies SandboxListOpts;

    const paginator = E2B.list(listOptions);

    let count = 0;
    while (paginator.hasNext) {
        count += (await paginator.nextItems()).length;
    }

    return count;
}

function toSandboxCommandError(error: unknown): Error {
    if (error instanceof CommandExitError) {
        return new SandboxCommandExitError(stripWorkspacePath(error.message), {
            stdout: stripWorkspacePath(error.stdout),
            stderr: stripWorkspacePath(error.stderr),
            exitCode: error.exitCode
        });
    }

    if (error instanceof TimeoutError) {
        return new SandboxCommandTimeoutError(stripWorkspacePath(error.message), { cause: error });
    }

    return error instanceof Error ? error : new Error(String(error));
}

function resolvePath(value: string | undefined): string {
    if (!value || value === '.') {
        return workspacePath;
    }

    return path.isAbsolute(value) ? value : path.join(workspacePath, value);
}

function stripWorkspacePath(value: string): string;
function stripWorkspacePath(value: undefined): undefined;
function stripWorkspacePath(value: string | undefined): string | undefined {
    return value?.replaceAll(`${workspacePath}/`, '').replaceAll(workspacePath, '.');
}

function isExecutionEnvironmentUnavailableError(error: unknown): boolean {
    if (error instanceof RateLimitError) {
        return true;
    }

    if (hasHttpStatus(error, 429)) {
        return true;
    }

    const message = stringifyError(error).toLowerCase();

    return (
        message.includes('rate limit') ||
        message.includes('too many sandboxes') ||
        message.includes('concurrent sandbox') ||
        message.includes('concurrency limit') ||
        message.includes('sandbox limit') ||
        message.includes('quota')
    );
}

function hasHttpStatus(error: unknown, status: number): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const err = error as Record<string, unknown>;
    return err['status'] === status || err['statusCode'] === status || err['code'] === status;
}
