import { afterEach, describe, expect, it, vi } from 'vitest';

import * as sandbox from '@nangohq/sandbox';
import * as shared from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { deployFunction, deployTemplate, getDeploymentStatus } from './functionDeployment.service.js';
import * as integrationTemplateService from './integrationTemplate.service.js';

import type { DBFunctionDeployment } from '@nangohq/sandbox';
import type { Config } from '@nangohq/shared';
import type { DBEnvironment, DBSyncConfig, DBTeam, SyncDeploymentResult } from '@nangohq/types';

describe('functionDeploymentService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts a single function deployment and returns its initial job state', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({ id: 12 } as Config);
        vi.spyOn(shared, 'getSyncConfigRaw').mockResolvedValue(null);
        const createSpy = vi
            .spyOn(sandbox, 'createFunctionDeployment')
            .mockResolvedValue(Ok({ id: deploymentId, status: 'waiting', created_at: '2026-01-01T00:00:00.000Z' }));
        vi.spyOn(sandbox.sandboxApiKeyService, 'createSandboxApiKey').mockResolvedValue(Ok('sandbox-api-key'));
        const start = vi.fn().mockResolvedValue(undefined);
        const kill = vi.fn().mockResolvedValue(undefined);
        const startedAt = new Date('2026-01-01T00:00:01.000Z');
        const executionTimeoutAt = new Date('2026-01-01T00:05:31.000Z');
        const prepareSpy = vi.spyOn(sandbox, 'prepareAsyncDeploy').mockResolvedValue({
            sandboxId: 'sandbox-id',
            startedAt,
            executionTimeoutAt,
            start,
            kill
        });
        const runningRow = { id: deploymentId, job_type: 'deployment', status: 'running' } as DBFunctionDeployment;
        const runningSpy = vi.spyOn(sandbox, 'markFunctionDeploymentRunning').mockResolvedValue(runningRow);
        vi.spyOn(sandbox, 'toFunctionDeploymentCreate').mockReturnValue({
            id: deploymentId,
            status: 'running',
            created_at: '2026-01-01T00:00:00.000Z'
        });

        const result = await deployFunction({
            environment,
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

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                id: deploymentId,
                status: 'running',
                created_at: '2026-01-01T00:00:00.000Z'
            });
        }
        expect(createSpy).toHaveBeenCalledWith({
            environmentId: 42,
            request: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}',
                version: '1.0.0',
                allow_destructive: false
            }
        });
        expect(prepareSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                integration_id: 'github',
                function_name: 'sync-issues',
                deployment_id: deploymentId,
                nango_secret_key: 'sandbox-api-key',
                allow_destructive: false
            })
        );
        expect(runningSpy).toHaveBeenCalledWith({
            environmentId: 42,
            id: deploymentId,
            sandboxId: 'sandbox-id',
            startedAt,
            executionTimeoutAt
        });
        expect(start).toHaveBeenCalledOnce();
        expect(kill).not.toHaveBeenCalled();
    });

    it('allows a destructive deployment only for an existing standalone function', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({ id: 12 } as Config);
        vi.spyOn(shared, 'getSyncConfigRaw').mockResolvedValue({ source: 'standalone' } as DBSyncConfig);
        const createSpy = vi.spyOn(sandbox, 'createFunctionDeployment').mockResolvedValue(Err(new Error('stop after request assertion')));

        await deployFunction({
            environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}',
                allow_destructive: true
            }
        });

        expect(createSpy).toHaveBeenCalledOnce();
        expect(createSpy.mock.calls.at(0)?.[0]).toMatchObject({ environmentId: 42, request: { allow_destructive: true } });
    });

    it('rejects repo-managed functions before creating a deployment job', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({ id: 12 } as Config);
        vi.spyOn(shared, 'getSyncConfigRaw').mockResolvedValue({ source: 'repo' } as DBSyncConfig);
        const createSpy = vi.spyOn(sandbox, 'createFunctionDeployment');

        const result = await deployFunction({
            environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'invalid_request', message: "Cannot overwrite existing function 'sync-issues'" });
        }
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('requires a customer API key before starting a single function deployment', async () => {
        const configSpy = vi.spyOn(shared.configService, 'getProviderConfig');

        const result = await deployFunction({
            environment,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('customer_api_key_required');
        }
        expect(configSpy).not.toHaveBeenCalled();
    });

    it('returns integration_not_found before reading or creating deployment state', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
        const getSyncConfigSpy = vi.spyOn(shared, 'getSyncConfigRaw');
        const createSpy = vi.spyOn(sandbox, 'createFunctionDeployment');

        const result = await deployFunction({
            environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'missing',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'integration_not_found', message: "Integration 'missing' was not found" });
        }
        expect(getSyncConfigSpy).not.toHaveBeenCalled();
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('returns deployment_creation_failed without preparing a sandbox', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({ id: 12 } as Config);
        vi.spyOn(shared, 'getSyncConfigRaw').mockResolvedValue(null);
        const failure = new Error('database unavailable');
        vi.spyOn(sandbox, 'createFunctionDeployment').mockResolvedValue(Err(failure));
        const createSandboxApiKeySpy = vi.spyOn(sandbox.sandboxApiKeyService, 'createSandboxApiKey');
        const prepareSpy = vi.spyOn(sandbox, 'prepareAsyncDeploy');

        const result = await deployFunction({
            environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'deployment_creation_failed',
                message: 'Failed to create function deployment',
                cause: failure
            });
        }
        expect(createSandboxApiKeySpy).not.toHaveBeenCalled();
        expect(prepareSpy).not.toHaveBeenCalled();
    });

    it('returns function_error and preserves the function error payload in the failed deployment', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({ id: 12 } as Config);
        vi.spyOn(shared, 'getSyncConfigRaw').mockResolvedValue(null);
        vi.spyOn(sandbox, 'createFunctionDeployment').mockResolvedValue(
            Ok({
                id: deploymentId,
                status: 'waiting',
                created_at: '2026-01-01T00:00:00.000Z'
            })
        );
        vi.spyOn(sandbox.sandboxApiKeyService, 'createSandboxApiKey').mockResolvedValue(Ok('sandbox-api-key'));
        const payload = { diagnostics: [{ line: 4, message: 'Type mismatch' }] };
        const failure = new sandbox.FunctionError({ code: 'compilation_error', message: 'Compilation failed', status: 400, payload });
        vi.spyOn(sandbox, 'prepareAsyncDeploy').mockRejectedValue(failure);
        const failedSpy = vi.spyOn(sandbox, 'markFunctionDeploymentFailed').mockResolvedValue(null);

        const result = await deployFunction({
            environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'function_error', message: 'Compilation failed' });
            expect(result.error.cause).toBe(failure);
        }
        expect(failedSpy).toHaveBeenCalledWith({
            environmentId: 42,
            id: deploymentId,
            error: { code: 'compilation_error', message: 'Compilation failed', payload }
        });
    });

    it('marks the deployment failed and cleans up when the sandbox cannot start', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue({ id: 12 } as Config);
        vi.spyOn(shared, 'getSyncConfigRaw').mockResolvedValue(null);
        vi.spyOn(sandbox, 'createFunctionDeployment').mockResolvedValue(Ok({ id: deploymentId, status: 'waiting', created_at: '2026-01-01T00:00:00.000Z' }));
        vi.spyOn(sandbox.sandboxApiKeyService, 'createSandboxApiKey').mockResolvedValue(Ok('sandbox-api-key'));
        const failure = new Error('sandbox failed');
        const start = vi.fn().mockRejectedValue(failure);
        const kill = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(sandbox, 'prepareAsyncDeploy').mockResolvedValue({
            sandboxId: 'sandbox-id',
            startedAt: new Date(),
            executionTimeoutAt: new Date(),
            start,
            kill
        });
        vi.spyOn(sandbox, 'markFunctionDeploymentRunning').mockResolvedValue({ id: deploymentId } as DBFunctionDeployment);
        const failedSpy = vi.spyOn(sandbox, 'markFunctionDeploymentFailed').mockResolvedValue(null);

        const result = await deployFunction({
            environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'deployment_failed', cause: failure });
        }
        expect(kill).toHaveBeenCalledOnce();
        expect(failedSpy).toHaveBeenCalledWith({
            environmentId: 42,
            id: deploymentId,
            error: { code: 'deployment_error', message: '{"name":"Error","message":"sandbox failed"}' }
        });
    });

    it('deploys a template and records a terminal deployment job', async () => {
        vi.spyOn(integrationTemplateService, 'deployIntegrationTemplate').mockResolvedValue({
            ok: true,
            type: 'sync',
            result: { name: 'tables', version: '1.2.3' } as SyncDeploymentResult
        });
        const createSpy = vi
            .spyOn(sandbox, 'createSucceededFunctionDeployment')
            .mockResolvedValue(Ok({ id: deploymentId, status: 'success', created_at: '2026-01-01T00:00:00.000Z' }));

        const result = await deployTemplate({
            account,
            environment,
            plan: null,
            body: { type: 'template', integration_id: 'airtable', template: 'tables' }
        });

        expect(result.isOk()).toBe(true);
        expect(createSpy).toHaveBeenCalledWith({
            environmentId: 42,
            request: {
                type: 'template',
                integration_id: 'airtable',
                template: 'tables',
                function_name: 'tables',
                function_type: 'sync'
            },
            output: 'Successfully deployed the functions:\n- tables@1.2.3',
            deployedFunctions: [{ name: 'tables', version: '1.2.3' }]
        });
    });

    it('maps template deployment outcomes to transport-neutral errors', async () => {
        vi.spyOn(integrationTemplateService, 'deployIntegrationTemplate').mockResolvedValue({ ok: false, reason: 'ambiguous_template' });

        const result = await deployTemplate({
            account,
            environment,
            plan: null,
            body: { type: 'template', integration_id: 'google-calendar', template: 'settings' }
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'ambiguous_function',
                message: "'settings' exists as both a sync and an action; specify 'function_type' to disambiguate"
            });
        }
    });

    it('retrieves a deployment status from the authenticated environment', async () => {
        const deployment = {
            id: deploymentId,
            status: 'success' as const,
            integration_id: 'github',
            function_name: 'sync-issues',
            function_type: 'sync' as const,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:01:00.000Z',
            completed_at: '2026-01-01T00:01:00.000Z',
            deployed: true
        };
        const getSpy = vi.spyOn(sandbox, 'getFunctionDeployment').mockResolvedValue(deployment);

        const result = await getDeploymentStatus({ environment, id: deploymentId });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(deployment);
        }
        expect(getSpy).toHaveBeenCalledWith({ environmentId: 42, id: deploymentId });
    });

    it('returns a transport-neutral error when the deployment does not exist', async () => {
        vi.spyOn(sandbox, 'getFunctionDeployment').mockResolvedValue(null);

        const result = await getDeploymentStatus({ environment, id: deploymentId });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'deployment_not_found', message: `Deployment '${deploymentId}' was not found` });
        }
    });

    it('wraps deployment status storage failures', async () => {
        const cause = new Error('database unavailable');
        vi.spyOn(sandbox, 'getFunctionDeployment').mockRejectedValue(cause);

        const result = await getDeploymentStatus({ environment, id: deploymentId });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'deployment_status_failed', cause });
        }
    });
});

const deploymentId = '3c66291f-6247-47a6-a100-f4d621d751f7';
const account = { id: 1, name: 'Test account' } as DBTeam;
const environment = { id: 42, name: 'dev' } as DBEnvironment;
