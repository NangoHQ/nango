import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { logger } from '../../logger.js';
import { getRunners } from '../../runner/runner.js';
import { abortTask, abortTaskWithId } from './abort.js';

import type { TaskAbort } from '@nangohq/nango-orchestrator';
import type { DBAPISecret } from '@nangohq/types';

const { mockPutTaskAbort, mockSetTaskSuccess, mockOrchestratorFailed } = vi.hoisted(() => ({
    mockPutTaskAbort: vi.fn(),
    mockSetTaskSuccess: vi.fn(),
    mockOrchestratorFailed: vi.fn()
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
        failed: mockOrchestratorFailed
    }
}));

vi.mock('./state.js', () => ({
    setTaskSuccess: mockSetTaskSuccess
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
        mockSetTaskSuccess.mockResolvedValue(Ok({} as never));
        mockOrchestratorFailed.mockResolvedValue(Ok({} as never));
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

function createAbortTask(overrides?: Partial<TaskAbort>): TaskAbort {
    return {
        id: 'abort-task-1',
        name: 'abort',
        connection: { environment_id: 1 } as TaskAbort['connection'],
        abortedTask: { id: 'task-1' } as TaskAbort['abortedTask'],
        ...overrides
    } as TaskAbort;
}

describe('abortTask', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(shared.accountService, 'getAccountContext').mockResolvedValue({
            account: { id: 42 },
            environment: { id: 1, name: 'dev' }
        } as never);
        vi.spyOn(shared.secretService, 'getDefaultSecretForEnv').mockResolvedValue(Ok({ secret: 'secret-key' } as DBAPISecret));
        mockPutTaskAbort.mockResolvedValue(Ok(undefined));
        mockSetTaskSuccess.mockResolvedValue(Ok({} as never));
        mockOrchestratorFailed.mockResolvedValue(Ok({} as never));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('marks the abort task successful when abortTaskWithId succeeds', async () => {
        const abortA = vi.fn().mockResolvedValue(true);
        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(Ok([{ client: { abort: { mutate: abortA } } }] as any[]));

        const result = await abortTask(createAbortTask());

        expect(result.isOk()).toBe(true);
        expect(mockSetTaskSuccess).toHaveBeenCalledWith({ taskId: 'abort-task-1', output: {} });
        expect(mockOrchestratorFailed).not.toHaveBeenCalled();
    });

    it('marks the abort task failed and does not call setTaskSuccess when abortTaskWithId fails', async () => {
        const abortA = vi.fn().mockResolvedValue(false);
        (getRunners as unknown as { mockResolvedValue: (value: any) => void }).mockResolvedValue(Ok([{ client: { abort: { mutate: abortA } } }] as any[]));

        const result = await abortTask(createAbortTask());

        expect(result.isErr()).toBe(true);
        expect(mockOrchestratorFailed).toHaveBeenCalledWith({
            taskId: 'abort-task-1',
            error: expect.objectContaining({ message: 'Failed to cancel' })
        });
        expect(mockSetTaskSuccess).not.toHaveBeenCalled();
    });
});
