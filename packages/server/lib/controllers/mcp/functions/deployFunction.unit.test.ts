import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { deployFunctionTool } from './deployFunction.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('deployFunctionTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts a function deployment with the authenticated customer API key', async () => {
        const response = { id: deploymentId, status: 'running' as const, created_at: '2026-01-01T00:00:00.000Z' };
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployFunction').mockResolvedValue(Ok(response));

        const result = await deployFunctionTool.handler(
            {
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}',
                version: '1.0.0',
                allow_destructive: true
            },
            context
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(response);
        }
        expect(deploySpy).toHaveBeenCalledWith({
            environment: context.environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}',
                version: '1.0.0',
                allow_destructive: true
            }
        });
    });

    it.each([
        { name: 'missing function name', args: { integration_id: 'github', function_type: 'sync', code: 'code' } },
        { name: 'missing function type', args: { integration_id: 'github', function_name: 'issues', code: 'code' } },
        { name: 'empty code', args: { integration_id: 'github', function_name: 'issues', function_type: 'sync', code: '' } },
        {
            name: 'template argument',
            args: { integration_id: 'github', function_name: 'issues', function_type: 'sync', code: 'code', template: 'issues' }
        },
        { name: 'invalid integration ID', args: { integration_id: '..', function_name: 'issues', function_type: 'sync', code: 'code' } }
    ])('rejects $name before calling the deployment service', async ({ args }) => {
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployFunction');

        const result = await deployFunctionTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid deploy_function arguments:');
        }
        expect(deploySpy).not.toHaveBeenCalled();
    });

    it('returns expected deployment errors as public MCP errors', async () => {
        vi.spyOn(functionDeploymentService, 'deployFunction').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'integration_not_found',
                    message: "Integration 'missing' was not found"
                })
            )
        );

        const result = await deployFunctionTool.handler(
            {
                integration_id: 'missing',
                function_name: 'issues',
                function_type: 'sync',
                code: 'export default {}'
            },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Integration 'missing' was not found");
        }
    });

    it('maps infrastructure deployment failures to an internal MCP error', async () => {
        vi.spyOn(functionDeploymentService, 'deployFunction').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'deployment_failed',
                    message: 'Failed to start function deployment',
                    cause: new Error('sensitive sandbox failure')
                })
            )
        );

        const result = await deployFunctionTool.handler(
            {
                integration_id: 'github',
                function_name: 'issues',
                function_type: 'sync',
                code: 'export default {}'
            },
            context
        );

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
