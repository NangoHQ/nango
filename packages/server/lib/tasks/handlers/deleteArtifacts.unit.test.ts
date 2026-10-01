import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteFunctionFiles = vi.fn();
vi.mock('@nangohq/shared', () => ({
    deleteFunctionFiles: (...args: unknown[]) => deleteFunctionFiles(...args)
}));

const { deleteArtifactsTask } = await import('./deleteArtifacts.js');

const ctx = { taskId: 't', attempt: 0, logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warning: vi.fn() } } as any;

describe('deleteArtifacts task', () => {
    beforeEach(() => {
        deleteFunctionFiles.mockReset().mockResolvedValue(undefined);
    });

    it('deletes legacy artifact locations exactly as provided', async () => {
        const fileLocations = ['dev/functions/contacts-v2.js', 'dev/functions/contacts.ts'];

        const result = await deleteArtifactsTask.handle({ environmentId: 10, fileLocations }, ctx);

        expect(result.isOk()).toBe(true);
        expect(deleteFunctionFiles).toHaveBeenCalledWith(fileLocations);
    });
});
