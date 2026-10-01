import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

const deleteFunctionFiles = vi.fn();
const safeToDeleteArtifacts = vi.fn();
vi.mock('@nangohq/shared', () => ({
    deleteFunctionFiles: (...args: unknown[]) => deleteFunctionFiles(...args),
    functionConfigService: { safeToDeleteArtifacts: (...args: unknown[]) => safeToDeleteArtifacts(...args) }
}));
vi.mock('@nangohq/database', () => ({ default: { knex: 'db' } }));

const { deleteFunctionArtifactsTask } = await import('./deleteFunctionArtifacts.js');

const ctx = { taskId: 't', attempt: 0, logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warning: vi.fn() } } as any;

describe('deleteFunctionArtifacts task', () => {
    beforeEach(() => {
        deleteFunctionFiles.mockReset().mockResolvedValue(undefined);
        safeToDeleteArtifacts.mockReset();
    });

    it('checks artifacts for live references before deleting them', async () => {
        safeToDeleteArtifacts.mockResolvedValue(Ok(['dev/functions/hash.js', 'dev/functions/hash.ts']));

        const result = await deleteFunctionArtifactsTask.handle({ environmentId: 10, fileLocations: ['dev/functions/hash.js'] }, ctx);

        expect(result.isOk()).toBe(true);
        expect(safeToDeleteArtifacts).toHaveBeenCalledWith('db', {
            environmentId: 10,
            fileLocations: ['dev/functions/hash.js']
        });
        expect(deleteFunctionFiles).toHaveBeenCalledWith(['dev/functions/hash.js', 'dev/functions/hash.ts']);
    });
});
