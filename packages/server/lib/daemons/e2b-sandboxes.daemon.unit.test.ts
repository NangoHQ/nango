import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getRunningSandboxCount: vi.fn(),
    gauge: vi.fn()
}));

vi.mock('@nangohq/sandbox', () => ({
    getRunningSandboxCount: mocks.getRunningSandboxCount
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();

    if (!actual || typeof actual !== 'object') {
        throw new Error('Invalid @nangohq/utils mock');
    }

    return {
        ...actual,
        metrics: {
            Types: {
                E2B_RUNNING_SANDBOXES: 'nango.server.e2b.sandboxes.running'
            },
            gauge: mocks.gauge
        }
    };
});

import { reportE2BRunningSandboxCount } from './e2b-sandboxes.daemon.js';

describe('e2bSandboxesDaemon', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reports the running sandbox count as a gauge', async () => {
        mocks.getRunningSandboxCount.mockResolvedValueOnce(7);

        await expect(reportE2BRunningSandboxCount({ apiKey: 'e2b-key', requestTimeoutMs: 5_000 })).resolves.toBe(7);

        expect(mocks.getRunningSandboxCount).toHaveBeenCalledWith({ apiKey: 'e2b-key', requestTimeoutMs: 5_000 });
        expect(mocks.gauge).toHaveBeenCalledWith('nango.server.e2b.sandboxes.running', 7);
    });
});
