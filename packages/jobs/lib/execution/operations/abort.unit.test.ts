import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { logger } from '../../logger.js';
import { getRunners } from '../../runner/runner.js';
import { abortTaskWithId } from './abort.js';

import type { DBAPISecret } from '@nangohq/types';

const { mockPutTaskAbort } = vi.hoisted(() => ({
    mockPutTaskAbort: vi.fn()
}));

vi.mock('@nangohq/nango-runner', () => ({
    PersistClient: vi.fn(function PersistClient() {
        return {
            putTaskAbort: mockPutTaskAbort
        };
    })
}));

vi.mock('../../clients.js', () => ({
    orchestratorClient: {
        failed: vi.fn()
    }
}));

vi.mock('../../runner/runner.js', () => ({
    getRunners: vi.fn()
}));

vi.mock('../../logger.js', () => ({
    logger: {
        error: vi.fn()
    }
}));

describe('abortTaskWithId', () => {
    beforeEach(() => {
        vi.spyOn(shared.accountService, 'getAccountContext').mockResolvedValue({
            environment: { id: 1, name: 'dev' }
        } as never);
        vi.spyOn(shared.secretService, 'getDefaultSecretForEnv').mockResolvedValue(Ok({ secret: 'secret-key' } as DBAPISecret));
        mockPutTaskAbort.mockResolvedValue(Ok(undefined));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('broadcasts abort and succeeds when any runner confirms', async () => {
        const abortA = vi.fn().mockResolvedValue(false);
        const abortB = vi.fn().mockResolvedValue(true);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(
            Ok([{ client: { abort: { mutate: abortA } } }, { client: { abort: { mutate: abortB } } }] as any[])
        );

        const result = await abortTaskWithId({ taskId: 'task-1', teamId: 42, environmentId: 1 });

        expect(result.isOk()).toBe(true);
        expect(mockPutTaskAbort).toHaveBeenCalledWith({ environmentId: 1, taskId: 'task-1' });
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-1' });
        expect(abortB).toHaveBeenCalledWith({ taskId: 'task-1' });
    });

    it('succeeds with a single runner that confirms abort', async () => {
        const abortA = vi.fn().mockResolvedValue(true);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(Ok([{ client: { abort: { mutate: abortA } } }] as any[]));

        const result = await abortTaskWithId({ taskId: 'task-2', teamId: 7, environmentId: 1 });

        expect(result.isOk()).toBe(true);
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-2' });
    });

    it('broadcasts abort when setting abort flag fails but a runner confirms', async () => {
        mockPutTaskAbort.mockResolvedValue(Err(new Error('persist unavailable')));
        const abortA = vi.fn().mockResolvedValue(true);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(Ok([{ client: { abort: { mutate: abortA } } }] as any[]));

        const result = await abortTaskWithId({ taskId: 'task-flag-fail', teamId: 42, environmentId: 1 });

        expect(result.isOk()).toBe(true);
        expect(logger.error).toHaveBeenCalled();
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-flag-fail' });
    });

    it('returns error when all runners fail to abort', async () => {
        const abortA = vi.fn().mockResolvedValue(false);
        const abortB = vi.fn().mockResolvedValue(false);

        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(
            Ok([{ client: { abort: { mutate: abortA } } }, { client: { abort: { mutate: abortB } } }] as any[])
        );

        const result = await abortTaskWithId({ taskId: 'task-3', teamId: 9, environmentId: 1 });

        expect(result.isErr()).toBe(true);
        expect(abortA).toHaveBeenCalledWith({ taskId: 'task-3' });
        expect(abortB).toHaveBeenCalledWith({ taskId: 'task-3' });
    });
});
