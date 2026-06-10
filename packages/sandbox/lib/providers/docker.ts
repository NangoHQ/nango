import { randomUUID } from 'node:crypto';

import { SandboxCommandExitError, SandboxCommandTimeoutError } from './errors.js';
import { remoteFunctionLocalImage } from '../functions/runtime.js';
import { execDockerFileAsync, isExecTimeoutError, readContainerFile, rewriteDockerHostForLocalhost, writeContainerFile } from '../local/docker.js';

import type { CleanupSandboxParams, CreateSandboxParams, Sandbox, SandboxCommandParams, SandboxCommandResult, SandboxFile, SandboxProvider } from './types.js';

export class DockerSandboxProvider implements SandboxProvider {
    public readonly name = 'docker';

    async create(params: CreateSandboxParams): Promise<Sandbox> {
        const containerName = `nango-${params.purpose}-${randomUUID().slice(0, 8)}`;
        await execDockerFileAsync(
            [
                'run',
                '--rm',
                '-d',
                '--name',
                containerName,
                '--add-host',
                'host.docker.internal:host-gateway',
                remoteFunctionLocalImage,
                'sleep',
                String(Math.ceil(params.timeoutMs / 1000))
            ],
            { timeout: 10_000 }
        );

        return new DockerSandbox(containerName);
    }

    async cleanup({ sandboxId }: CleanupSandboxParams): Promise<void> {
        await execDockerFileAsync(['rm', '-f', sandboxId]);
    }
}

class DockerSandbox implements Sandbox {
    public readonly provider = 'docker';

    constructor(public readonly id: string) {}

    async writeFiles(files: SandboxFile[]): Promise<void> {
        for (const file of files) {
            await writeContainerFile(this.id, file.path, file.contents);
        }
    }

    async readTextFile(path: string): Promise<string> {
        return readContainerFile(this.id, path);
    }

    async runCommand(params: SandboxCommandParams): Promise<SandboxCommandResult> {
        try {
            return await execDockerFileAsync(this.buildExecArgs(params), { timeout: params.timeoutMs });
        } catch (err) {
            throw toDockerCommandError(err);
        }
    }

    async startCommand(params: SandboxCommandParams): Promise<void> {
        try {
            await execDockerFileAsync(this.buildExecArgs(params, { detached: true }), { timeout: params.timeoutMs });
        } catch (err) {
            throw toDockerCommandError(err);
        }
    }

    async stop(): Promise<void> {
        await execDockerFileAsync(['rm', '-f', this.id]);
    }

    private buildExecArgs(params: SandboxCommandParams, options: { detached?: boolean } = {}): string[] {
        const args = ['exec'];
        if (options.detached) {
            args.push('-d');
        }
        if (params.cwd) {
            args.push('-w', params.cwd);
        }
        for (const [key, value] of Object.entries(rewriteLocalhostEnvs(params.envs ?? {}))) {
            args.push('-e', `${key}=${value}`);
        }
        args.push(this.id, 'sh', '-lc', params.command);
        return args;
    }
}

function rewriteLocalhostEnvs(envs: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(envs).map(([key, value]) => [key, rewriteDockerHostForLocalhost(value)]));
}

function toDockerCommandError(error: unknown): Error {
    if (isExecTimeoutError(error)) {
        return new SandboxCommandTimeoutError('Docker sandbox command timed out', { cause: error });
    }

    if (!error || typeof error !== 'object') {
        return new SandboxCommandExitError(String(error));
    }

    const err = error as Record<string, unknown>;
    const stdout = typeof err['stdout'] === 'string' ? err['stdout'] : undefined;
    const stderr = typeof err['stderr'] === 'string' ? err['stderr'] : undefined;
    const exitCode = typeof err['code'] === 'number' ? err['code'] : 1;
    const message = typeof err['message'] === 'string' ? err['message'] : 'Docker sandbox command failed';

    return new SandboxCommandExitError(message, { stdout, stderr, exitCode });
}
