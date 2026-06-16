import { Sandbox as E2B } from 'e2b';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class CommandExitError extends Error {}

    class RateLimitError extends Error {}

    class TimeoutError extends Error {}

    const create = vi.fn();
    const list = vi.fn();
    const envs = {
        E2B_API_KEY: 'e2b-key' as string | undefined,
        E2B_SANDBOX_COMPILER_TEMPLATE: 'nango-template'
    };

    return { CommandExitError, RateLimitError, TimeoutError, create, envs, list };
});

vi.mock('e2b', () => ({
    CommandExitError: mocks.CommandExitError,
    RateLimitError: mocks.RateLimitError,
    Sandbox: { create: mocks.create, list: mocks.list },
    TimeoutError: mocks.TimeoutError
}));

vi.mock('../env.js', () => ({ envs: mocks.envs }));

import { E2BSandboxProvider, getRunningE2BSandboxCount } from './e2b.js';

import type { SandboxUnavailableError } from './errors.js';

describe('E2B provider', () => {
    beforeEach(() => {
        mocks.envs.E2B_API_KEY = 'e2b-key';
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('normalizes provider capacity errors to SandboxUnavailableError', async () => {
        const error = new mocks.RateLimitError('Rate limit exceeded - too many sandboxes');
        mocks.create.mockRejectedValueOnce(error);

        await expect(new E2BSandboxProvider().create({ purpose: 'dryrun', timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'SandboxUnavailableError',
            cause: error
        } satisfies Partial<SandboxUnavailableError>);
    });

    it('normalizes 429-shaped errors to SandboxUnavailableError', async () => {
        const error = { status: 429, message: 'too many requests' };
        mocks.create.mockRejectedValueOnce(error);

        await expect(new E2BSandboxProvider().create({ purpose: 'compile', timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'SandboxUnavailableError',
            cause: error
        } satisfies Partial<SandboxUnavailableError>);
    });

    it('normalizes quota-shaped messages to SandboxUnavailableError', async () => {
        const error = new Error('Concurrent sandboxes quota exceeded');
        mocks.create.mockRejectedValueOnce(error);

        await expect(new E2BSandboxProvider().create({ purpose: 'deploy', timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'SandboxUnavailableError',
            cause: error
        } satisfies Partial<SandboxUnavailableError>);
    });
});

describe('E2B provider helpers', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('counts all running sandboxes from the E2B paginator', async () => {
        const pages = [[{ sandboxId: 'sandbox-1' }, { sandboxId: 'sandbox-2' }], [{ sandboxId: 'sandbox-3' }]];
        let pageIndex = 0;
        const paginator = {
            get hasNext() {
                return pageIndex < pages.length;
            },
            nextItems: vi.fn(() => Promise.resolve(pages[pageIndex++] ?? []))
        };
        const list = vi.spyOn(E2B, 'list').mockReturnValue(paginator as unknown as ReturnType<typeof E2B.list>);

        const count = await getRunningE2BSandboxCount({ apiKey: 'e2b-key', requestTimeoutMs: 5_000 });

        expect(count).toBe(3);
        expect(list).toHaveBeenCalledWith({
            apiKey: 'e2b-key',
            requestTimeoutMs: 5_000,
            query: { state: ['running'] }
        });
        expect(paginator.nextItems).toHaveBeenCalledTimes(2);
    });
});
