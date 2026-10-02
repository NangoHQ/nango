import { afterEach, describe, expect, it, vi } from 'vitest';

import { jobsClient } from './jobs.js';

const task = {
    taskId: 'task-1',
    telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 },
    functionRuntime: 'lambda' as const
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('putTask', () => {
    it('still returns an error when the body cannot be read', async () => {
        const resp = new Response('unread', { status: 404 });
        vi.spyOn(resp, 'text').mockRejectedValue(new Error('socket hang up'));
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp));

        const res = await jobsClient.putTask(task);

        expect(res.isErr() && res.error.message).toContain('status=404');
    });

    it('propagates the underlying network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ETIMEDOUT')));

        const res = await jobsClient.putTask(task);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('connect ETIMEDOUT');
    });
});
