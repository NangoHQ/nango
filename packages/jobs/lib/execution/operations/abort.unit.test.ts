import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nangohq/kvstore', () => ({
    getKVStore: vi.fn(() => Promise.resolve({ set: vi.fn() })),
    getFeatureFlagsClient: vi.fn(() => Promise.resolve({}))
}));

vi.mock('../../runner/runner.js', () => ({
    getRunners: vi.fn()
}));

vi.mock('../../env.js', () => ({
    envs: {
        RUNNER_ABORT_CHECK_INTERVAL_MS: 1000
    }
}));

vi.mock('../../logger.js', () => ({
    logger: {
        error: vi.fn()
    }
}));

import { Ok } from '@nangohq/utils';

import { abortTaskWithId } from './abort.js';
import { getRunners } from '../../runner/runner.js';

describe('abortTaskWithId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('broadcasts abort and succeeds when any runner confirms', async () => {
        const abortA = vi.fn().mockResolvedValue(false);
        const abortB = vi.fn().mockResolvedValue(true);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(
            Ok([{ client: { abort: { mutate: abortA } } }, { client: { abort: { mutate: abortB } } }] as any[])
        );

        const result = await abortTaskWithId({ taskId: 'task-1', teamId: 42 });

        expect(result.isOk()).toBe(true);
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-1' });
        expect(abortB).toHaveBeenCalledWith({ taskId: 'task-1' });
    });

    it('succeeds with a single runner that confirms abort', async () => {
        const abortA = vi.fn().mockResolvedValue(true);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(Ok([{ client: { abort: { mutate: abortA } } }] as any[]));

        const result = await abortTaskWithId({ taskId: 'task-2', teamId: 7 });

        expect(result.isOk()).toBe(true);
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-2' });
    });

    it('returns error when all runners fail to abort', async () => {
        const abortA = vi.fn().mockResolvedValue(false);
        const abortB = vi.fn().mockResolvedValue(false);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(
            Ok([{ client: { abort: { mutate: abortA } } }, { client: { abort: { mutate: abortB } } }] as any[])
        );

        const result = await abortTaskWithId({ taskId: 'task-3', teamId: 9 });

        expect(result.isErr()).toBe(true);
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-3' });
        expect(abortB).toHaveBeenCalledWith({ taskId: 'task-3' });
    });
});
