import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { getDeploymentStatusTool } from './getDeploymentStatus.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('getDeploymentStatusTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the current deployment status', async () => {
        const response = {
            id: deploymentId,
            status: 'success' as const,
            integration_id: 'github',
            function_name: 'sync-issues',
            function_type: 'sync' as const,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:01:00.000Z',
            completed_at: '2026-01-01T00:01:00.000Z',
            deployed: true,
            deployed_functions: [{ name: 'sync-issues', version: '1.0.0' }]
        };
        const getSpy = vi.spyOn(functionDeploymentService, 'getDeploymentStatus').mockResolvedValue(Ok(response));

        const result = await getDeploymentStatusTool.handler({ id: deploymentId }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(response);
        }
        expect(getSpy).toHaveBeenCalledWith({ environment: context.environment, id: deploymentId });
    });

    it('rejects an invalid deployment ID before calling the service', async () => {
        const getSpy = vi.spyOn(functionDeploymentService, 'getDeploymentStatus');

        const result = await getDeploymentStatusTool.handler({ id: 'not-a-uuid' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid get_deployment_status arguments:');
        }
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('returns a missing deployment as a public MCP error', async () => {
        vi.spyOn(functionDeploymentService, 'getDeploymentStatus').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'deployment_not_found',
                    message: `Deployment '${deploymentId}' was not found`
                })
            )
        );

        const result = await getDeploymentStatusTool.handler({ id: deploymentId }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe(`Deployment '${deploymentId}' was not found`);
        }
    });

    it('maps status lookup failures to an internal MCP error', async () => {
        vi.spyOn(functionDeploymentService, 'getDeploymentStatus').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'deployment_status_failed',
                    message: 'Failed to retrieve deployment status',
                    cause: new Error('sensitive database failure')
                })
            )
        );

        const result = await getDeploymentStatusTool.handler({ id: deploymentId }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });
});

const deploymentId = '3c66291f-6247-47a6-a100-f4d621d751f7';
const context = {
    account: { id: 1 },
    environment: { id: 42 },
    plan: null,
    customerApiKeyId: 7,
    grantedScopes: ['environment:deploy']
} as ManagementMcpContext;
