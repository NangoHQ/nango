import { afterEach, describe, expect, it, vi } from 'vitest';

import { legacyFunctionService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';
import { listFunctionsTool } from './list.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { DeployedNangoFunction } from '@nangohq/types';

describe('listFunctionsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps integration filters and pagination to the legacy function service', async () => {
        const listSpy = vi.spyOn(legacyFunctionService, 'listFunctions').mockResolvedValue(Ok({ rows: [functionFixture], total: 25 }));

        const result = await listFunctionsTool.handler(
            {
                integration_id: 'github',
                type: 'action',
                search: 'issue',
                page: 2,
                limit: 10
            },
            context
        );

        expect(listSpy).toHaveBeenCalledWith({
            environmentId: 42,
            providerConfigKey: 'github',
            type: 'action',
            search: 'issue',
            limit: 10,
            offset: 20
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                data: [functionFixture],
                pagination: { total: 25, page: 2, limit: 10 }
            });
        }
    });

    it('applies the public endpoint pagination defaults', async () => {
        const listSpy = vi.spyOn(legacyFunctionService, 'listFunctions').mockResolvedValue(Ok({ rows: [], total: 0 }));

        const result = await listFunctionsTool.handler({ integration_id: 'github' }, context);

        expect(listSpy).toHaveBeenCalledWith({
            environmentId: 42,
            providerConfigKey: 'github',
            type: undefined,
            search: undefined,
            limit: 20,
            offset: 0
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.pagination).toStrictEqual({ total: 0, page: 0, limit: 20 });
        }
    });

    it.each([
        { name: 'missing integration ID', args: {} },
        { name: 'unknown argument', args: { integration_id: 'github', unexpected: true } },
        { name: 'string page', args: { integration_id: 'github', page: '1' } },
        { name: 'negative page', args: { integration_id: 'github', page: -1 } },
        { name: 'zero limit', args: { integration_id: 'github', limit: 0 } },
        { name: 'oversized limit', args: { integration_id: 'github', limit: 101 } },
        { name: 'invalid type', args: { integration_id: 'github', type: 'webhook' } },
        { name: 'blank search', args: { integration_id: 'github', search: ' ' } }
    ])('rejects $name before calling the function service', async ({ args }) => {
        const listSpy = vi.spyOn(legacyFunctionService, 'listFunctions');

        const result = await listFunctionsTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid functions_list arguments:');
        }
        expect(listSpy).not.toHaveBeenCalled();
    });

    it('returns a public error when the integration does not exist', async () => {
        vi.spyOn(legacyFunctionService, 'listFunctions').mockResolvedValue(
            Err(
                new legacyFunctionService.ListFunctionsError({
                    code: 'integration_not_found',
                    message: 'Integration does not exist'
                })
            )
        );

        const result = await listFunctionsTool.handler({ integration_id: 'missing' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Integration does not exist');
        }
    });

    it('maps internal listing failures to an internal MCP error', async () => {
        const error = new legacyFunctionService.ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions' });
        vi.spyOn(legacyFunctionService, 'listFunctions').mockResolvedValue(Err(error));

        const result = await listFunctionsTool.handler({ integration_id: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });
});

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:functions:list']
} as ManagementMcpContext;

const functionFixture: DeployedNangoFunction = {
    id: 1,
    name: 'create-issue',
    type: 'action',
    description: 'Create an issue',
    scopes: ['repo'],
    returns: ['Issue'],
    json_schema: null,
    enabled: true,
    last_deployed: '2026-01-01T00:00:00.000Z',
    source: 'repo'
};
