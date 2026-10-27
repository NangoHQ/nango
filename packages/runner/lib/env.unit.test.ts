import { describe, expect, it, vi } from 'vitest';

describe('runner env', () => {
    it('requires RUNNER_NODE_ID when the variable is absent', async () => {
        vi.stubEnv('RUNNER_NODE_ID', undefined);
        vi.resetModules();

        await expect(import('./env.js')).rejects.toThrow(/RUNNER_NODE_ID/);
    });
});
