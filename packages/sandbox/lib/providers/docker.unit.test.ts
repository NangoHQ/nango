import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execDockerFileAsync: vi.fn(),
    isExecTimeoutError: vi.fn(),
    readContainerFile: vi.fn(),
    rewriteDockerHostForLocalhost: vi.fn((value: string) => value),
    writeContainerFile: vi.fn()
}));

vi.mock('../local/docker.js', () => ({
    execDockerFileAsync: mocks.execDockerFileAsync,
    isExecTimeoutError: mocks.isExecTimeoutError,
    readContainerFile: mocks.readContainerFile,
    rewriteDockerHostForLocalhost: mocks.rewriteDockerHostForLocalhost,
    writeContainerFile: mocks.writeContainerFile
}));

vi.mock('../functions/runtime.js', () => ({
    remoteFunctionLocalImage: 'agent-sandboxes/blank-workspace:local'
}));

import { DockerSandboxProvider } from './docker.js';

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

        await provider.cleanup({ sandboxId: 'nango-dryrun-12345678' });

        expect(mocks.execDockerFileAsync).toHaveBeenCalledWith(['rm', '-f', 'nango-dryrun-12345678']);
    });
});
