import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFunction, listFunctions, ListFunctionsError, listTemplates } from './service.js';

import type { FunctionRow } from './models/functions.js';

const { mockFindActiveByEnvironment, mockFindActiveByName, mockFindActiveFunctionAvailability, mockGetIdByProviderConfigKey } = vi.hoisted(() => {
    return {
        mockFindActiveByEnvironment: vi.fn(),
        mockFindActiveByName: vi.fn(),
        mockFindActiveFunctionAvailability: vi.fn(),
        mockGetIdByProviderConfigKey: vi.fn()
    };
});

vi.mock('../../config.service.js', () => ({
    default: { getIdByProviderConfigKey: mockGetIdByProviderConfigKey }
}));

vi.mock('./models/functions.js', () => ({
    findActiveByEnvironment: mockFindActiveByEnvironment,
    findActiveByName: mockFindActiveByName,
    findActiveFunctionAvailability: mockFindActiveFunctionAvailability
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
    event: null,
    tool: null
};

describe('function lookup service', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockGetIdByProviderConfigKey.mockResolvedValue(10);
        mockFindActiveByEnvironment.mockResolvedValue({ rows: [baseRow], total: 1 });
    });

    it('returns only visible templates, with native tools taking precedence over legacy actions', async () => {
        const deployment = {
            id: 1,
            name: 'users',
            type: 'action',
            enabled: false,
            last_deployed: new Date('2026-01-01T00:00:00.000Z'),
            source: 'repo'
        };
        mockFindActiveFunctionAvailability.mockResolvedValue({
            deployed: [deployment, { ...deployment, id: 2, type: 'sync' }, { ...deployment, id: 3, name: 'legacy' }],
            toolNames: ['users', 'native-only']
        });
        const action = { type: 'action' as const, name: 'users', returns: [], json_schema: null };
        const sync = { ...action, type: 'sync' as const, runs: null, auto_start: false, track_deletes: false };

        const templates = await listTemplates({
            environmentId: 1,
            providerConfigKey: 'github',
            templates: [action, sync, { ...action, name: 'legacy' }, { ...action, name: 'native-only' }, { ...action, name: 'undeployed' }]
        });

        expect(templates.unwrap()).toEqual([
            { ...sync, deployed: { id: 2, enabled: false, last_deployed: deployment.last_deployed.toISOString(), source: 'repo' } },
            { ...action, name: 'legacy', deployed: { id: 3, enabled: false, last_deployed: deployment.last_deployed.toISOString(), source: 'repo' } },
            { ...action, name: 'undeployed' }
        ]);
    });

    it('returns Err when template availability lookup fails', async () => {
        const cause = new Error('Database unavailable');
        mockFindActiveFunctionAvailability.mockRejectedValue(cause);

        const result = await listTemplates({ environmentId: 1, providerConfigKey: 'github', templates: [] });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ message: 'Failed to list templates', cause });
        }
    });

    it('returns tools', async () => {
        const input = { type: 'object', properties: { item: { $ref: '#/definitions/Item' } } } as const;
        const item = { type: 'string' } as const;
        mockFindActiveByEnvironment.mockResolvedValue({
            rows: [
                {
                    ...baseRow,
                    type: 'tool',
                    json_schema: { definitions: { Input: input, Item: item, Other: { type: 'number' } } },
                    tool: {
                        uuid: '11111111-1111-4111-8111-111111111111',
                        integration_id: 'github',
                        provider: 'github',
                        input_schema_ref: '#/definitions/Input',
                        output_schema_ref: null,
                        tags: { instructions: 'Read users', required_scopes: ['read'], category: 'crm' }
                    }
                }
            ],
            total: 1
        });

        const result = await listFunctions({ environmentId: 1, providerConfigKey: 'github', type: 'tool', search: undefined, limit: 20, offset: 0 });

        const row = result.unwrap().rows[0];
        if (row?.type !== 'tool') {
            throw new Error('Expected a tool row');
        }
        expect(row).toMatchObject({
            type: 'tool',
            uuid: '11111111-1111-4111-8111-111111111111',
            integration_id: 'github',
            provider: 'github',
            output_json_schema: null
        });
        expect(row.input_json_schema).toEqual({ $ref: '#/definitions/Input', definitions: { Input: input, Item: item } });
        expect(row.meta).toEqual({ instructions: 'Read users', required_scopes: ['read'], tags: { category: 'crm' } });
    });

    it('returns mapped rows and total for valid functions', async () => {
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
        expect(mockGetIdByProviderConfigKey).toHaveBeenCalledWith(1, 'github');
        expect(mockFindActiveByEnvironment).toHaveBeenCalledWith({
            environmentId: 1,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });
    });

    it('returns a typed error when the integration does not exist', async () => {
        mockGetIdByProviderConfigKey.mockResolvedValue(null);

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'missing',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ListFunctionsError);
            expect(result.error).toMatchObject({ code: 'integration_not_found', message: 'Integration does not exist' });
        }
        expect(mockFindActiveByEnvironment).not.toHaveBeenCalled();
    });

    it('wraps unexpected listing failures in a typed internal error', async () => {
        const cause = new Error('database failed');
        mockFindActiveByEnvironment.mockRejectedValue(cause);

        const result = await listFunctions({
            environmentId: 1,
            providerConfigKey: 'github',
            type: 'sync',
            search: 'user',
            limit: 10,
            offset: 20
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ListFunctionsError);
            expect(result.error).toMatchObject({ code: 'list_failed', message: 'Failed to list functions', cause });
        }
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
            expect(result.error).toBeInstanceOf(ListFunctionsError);
            expect(result.error).toMatchObject({ code: 'list_failed', message: 'Failed to list functions' });
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

    it('maps a catalog action returned by the model', async () => {
        mockFindActiveByName.mockResolvedValue({
            ...baseRow,
            id: null,
            name: 'create-issue',
            type: 'action',
            last_deployed: null,
            source: 'tools-catalog'
        });

        const result = await getFunction({
            environmentId: 1,
            providerConfigKey: 'github',
            name: 'create-issue',
            type: 'action'
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }
        expect(result.value).toMatchObject({ name: 'create-issue', source: 'tools-catalog', id: null });
    });
});
