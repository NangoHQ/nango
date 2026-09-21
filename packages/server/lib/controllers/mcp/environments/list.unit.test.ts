import { afterEach, describe, expect, it, vi } from 'vitest';

import { environmentService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { listEnvironmentsTool } from './list.js';

import type { Principal } from '@nangohq/authz';
import type { DBTeam } from '@nangohq/types';

const account = { id: 42 } as DBTeam;
const environmentSummaries = [
    { id: 1, uuid: 'dev-environment', name: 'dev', is_production: false },
    { id: 2, uuid: 'prod-environment', name: 'prod', is_production: true }
];

describe('environments_list', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts only an empty input object', () => {
        expect(listEnvironmentsTool.inputSchema.safeParse({}).success).toBe(true);
        expect(listEnvironmentsTool.inputSchema.safeParse({ environment: 'dev' }).success).toBe(false);
    });

    it('loads environments and applies current RBAC permissions', async () => {
        const getEnvironmentsSpy = vi.spyOn(environmentService, 'getEnvironmentsByAccountId').mockResolvedValue(Ok(environmentSummaries));

        const result = await listEnvironmentsTool.handler({
            account,
            principal: principal(['environment:settings:read'], ['env:non-production'])
        });

        expect(getEnvironmentsSpy).toHaveBeenCalledOnce();
        expect(getEnvironmentsSpy).toHaveBeenCalledWith(42);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ environments: [{ name: 'dev', is_production: false }] });
        }
    });

    it('may return no environments', async () => {
        vi.spyOn(environmentService, 'getEnvironmentsByAccountId').mockResolvedValue(Ok([]));

        const result = await listEnvironmentsTool.handler({
            account,
            principal: principal(['environment:*'], ['env:*'])
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ environments: [] });
        }
    });

    it('returns environment lookup failures', async () => {
        const error = new Error('failed to retrieve environments');
        vi.spyOn(environmentService, 'getEnvironmentsByAccountId').mockResolvedValue(Err(error));

        const result = await listEnvironmentsTool.handler({
            account,
            principal: principal(['environment:*'], ['env:*'])
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBe(error);
        }
    });
});

function principal(can: Principal['grants'][number]['can'], where: Principal['grants'][number]['where']): Principal {
    return {
        subject: { type: 'user', id: '7', display: 'user@nango.dev' },
        accountId: 42,
        grants: [{ can, where }]
    };
}
