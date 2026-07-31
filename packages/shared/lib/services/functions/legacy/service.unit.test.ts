import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFunction, listFunctions } from './service.js';

import type { FunctionRow } from './models/functions.js';

const { mockFindActiveByEnvironment, mockFindActiveByName } = vi.hoisted(() => {
    return {
        mockFindActiveByEnvironment: vi.fn(),
        mockFindActiveByName: vi.fn()
    };
});

vi.mock('./models/functions.js', () => ({
    findActiveByEnvironment: mockFindActiveByEnvironment,
    findActiveByName: mockFindActiveByName
}));

const baseRow: FunctionRow = {
    id: 1,
    name: 'users',
    type: 'sync',
    metadata: { description: 'Sync users', scopes: ['read:users'] },
    input: 'UserInput',
    returns: ['User'],
    json_schema: null,
    runs: 'every day',
    auto_start: true,
    track_deletes: false,
    enabled: true,
    last_deployed: new Date('2026-01-01T00:00:00.000Z'),
    source: 'repo',
    event: null
};

describe('functions service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns mapped rows and total for valid functions', async () => {
        mockFindActiveByEnvironment.mockResolvedValue({ rows: [baseRow], total: 1 });

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }

        expect(result.value).toEqual({
            rows: [
                {
                    id: 1,
                    name: 'users',
                    type: 'sync',
                    description: 'Sync users',
                    scopes: ['read:users'],
                    input: 'UserInput',
                    returns: ['User'],
                    json_schema: null,
                    runs: 'every day',
                    auto_start: true,
                    track_deletes: false,
                    enabled: true,
                    last_deployed: '2026-01-01T00:00:00.000Z',
                    source: 'repo'
                }
            ],
            total: 1
        });
    });

    it('returns Err instead of silently dropping invalid on-event rows', async () => {
        mockFindActiveByEnvironment.mockResolvedValue({
            rows: [{ ...baseRow, type: 'on-event', event: 'UNKNOWN_EVENT', input: null, returns: null, runs: null, auto_start: null, track_deletes: null }],
            total: 1
        });

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('failed_to_list_functions');
        }
    });

    it('returns Err when a single function row cannot be mapped', async () => {
        mockFindActiveByName.mockResolvedValue({
            ...baseRow,
            type: 'on-event',
            input: null,
            returns: null,
            runs: null,
            auto_start: null,
            track_deletes: null,
            event: 'UNKNOWN_EVENT'
        });

        const result = await getFunction({
            environmentId: 1,
            providerConfigKey: 'github',
            name: 'users',
            type: 'on-event'
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('failed_to_get_function');
        }
    });
});
