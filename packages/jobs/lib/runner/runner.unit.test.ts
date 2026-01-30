import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nangohq/nango-runner', () => ({
    getRunnerClient: vi.fn(() => ({
        abort: { mutate: vi.fn() },
        start: { mutate: vi.fn() }
    }))
}));

vi.mock('../env.js', () => ({
    envs: {
        RUNNER_TYPE: 'KUBERNETES',
        RUNNER_CLIENT_HEADERS_TIMEOUT_MS: 1000,
        RUNNER_CLIENT_CONNECT_TIMEOUT_MS: 1000,
        RUNNER_CLIENT_RESPONSE_TIMEOUT_MS: 1000
    }
}));

vi.mock('../runtime/runtimes.js', () => ({
    getDefaultFleet: vi.fn()
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        env: 'test',
        isProd: true
    };
});

import { Ok } from '@nangohq/utils';

import { getRunners } from './runner.js';
import { getDefaultFleet } from '../runtime/runtimes.js';

describe('getRunners', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns all runners from fleet nodes for team routing id', async () => {
        const nodes = [
            { id: 1, url: 'http://runner-a' },
            { id: 2, url: 'http://runner-b' }
        ] as any[];

        (getDefaultFleet as unknown as { mockReturnValue: (value: any) => void }).mockReturnValue({
            getNodesByRoutingId: vi.fn().mockResolvedValue(Ok(nodes)),
            getRunningNode: vi.fn()
        });

        const result = await getRunners(123);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(result.value).toHaveLength(2);
        expect(result.value.map((runner) => runner.url)).toEqual(['http://runner-a', 'http://runner-b']);
    });

    it('falls back to a single runner when no nodes are found', async () => {
        const node = { id: 3, url: 'http://runner-fallback' } as any;

        (getDefaultFleet as unknown as { mockReturnValue: (value: any) => void }).mockReturnValue({
            getNodesByRoutingId: vi.fn().mockResolvedValue(Ok([])),
            getRunningNode: vi.fn().mockResolvedValue(Ok(node))
        });

        const result = await getRunners(123);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw result.error;
        }
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.url).toBe('http://runner-fallback');
    });
});
