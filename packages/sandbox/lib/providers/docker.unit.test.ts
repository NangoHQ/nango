import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DockerSandboxProvider } from './docker.js';

const mocks = vi.hoisted(() => ({
    execDockerFileAsync: vi.fn(),
    isExecTimeoutError: vi.fn(),
    readContainerFile: vi.fn(),
    rewriteDockerHostForLocalhost: vi.fn((value: string) => value),
    writeContainerFile: vi.fn()
}));

vi.mock('./docker-utils.js', () => ({
    execDockerFileAsync: mocks.execDockerFileAsync,
    isExecTimeoutError: mocks.isExecTimeoutError,
    readContainerFile: mocks.readContainerFile,
    rewriteDockerHostForLocalhost: mocks.rewriteDockerHostForLocalhost,
    writeContainerFile: mocks.writeContainerFile
}));

describe('DockerSandboxProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.execDockerFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
    });

    it('creates auto-removing containers for local sandboxes', async () => {
        const provider = new DockerSandboxProvider();

        const sandbox = await provider.create({ purpose: 'dryrun', timeoutMs: 123_000 });

        expect(sandbox.id).toMatch(/^nango-dryrun-/);
        expect(mocks.execDockerFileAsync).toHaveBeenCalledWith(
            expect.arrayContaining(['run', '--rm', '-d', '--name', sandbox.id, 'agent-sandboxes/blank-workspace:local', 'sleep', '123']),
            { timeout: 10_000 }
        );
    });

    it('cleans up local sandboxes by container id', async () => {
        const provider = new DockerSandboxProvider();

        await provider.cleanup('nango-dryrun-12345678');

        expect(mocks.execDockerFileAsync).toHaveBeenCalledWith(['rm', '-f', 'nango-dryrun-12345678']);
    });

    it('resolves relative file paths inside the provider workspace', async () => {
        const provider = new DockerSandboxProvider();

        const sandbox = await provider.create({ purpose: 'compile', timeoutMs: 30_000 });
        await sandbox.writeFiles([{ path: 'github/actions/foo.ts', contents: 'export default true;' }]);

        expect(mocks.writeContainerFile).toHaveBeenCalledWith(sandbox.id, '/home/user/nango-integrations/github/actions/foo.ts', 'export default true;');
    });

    it('runs commands from the provider workspace by default', async () => {
        const provider = new DockerSandboxProvider();

        const sandbox = await provider.create({ purpose: 'compile', timeoutMs: 30_000 });
        await sandbox.runCommand({ command: 'nango compile', timeoutMs: 10_000, envs: { NO_COLOR: '1' } });

        expect(mocks.execDockerFileAsync).toHaveBeenLastCalledWith(
            ['exec', '-w', '/home/user/nango-integrations', '-e', 'NO_COLOR=1', sandbox.id, 'sh', '-lc', 'nango compile'],
            { timeout: 10_000 }
        );
    });

    it('strips provider workspace paths from command errors', async () => {
        const provider = new DockerSandboxProvider();
        const sandbox = await provider.create({ purpose: 'compile', timeoutMs: 30_000 });
        const commandError = Object.assign(new Error('Failed at /home/user/nango-integrations/github/actions/foo.ts'), {
            stdout: '/home/user/nango-integrations/github/actions/foo.ts:1:1',
            stderr: '',
            code: 1
        });
        mocks.execDockerFileAsync.mockRejectedValueOnce(commandError);

        await expect(sandbox.runCommand({ command: 'nango compile', timeoutMs: 10_000 })).rejects.toMatchObject({
            message: 'Failed at github/actions/foo.ts',
            stdout: 'github/actions/foo.ts:1:1',
            cause: commandError
        });
    });
});
