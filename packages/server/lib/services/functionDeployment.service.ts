import db from '@nangohq/database';
import {
    createFunctionDeployment,
    createSucceededFunctionDeployment,
    deploySandboxTimeoutMs,
    FunctionError,
    markFunctionDeploymentFailed,
    markFunctionDeploymentRunning,
    prepareAsyncDeploy,
    sandboxApiKeyService,
    toFunctionDeploymentCreate
} from '@nangohq/sandbox';
import { configService, getSyncConfigRaw } from '@nangohq/shared';
import { baseUrl, Err, Ok, stringifyError } from '@nangohq/utils';

import { deployIntegrationTemplate } from './integrationTemplate.service.js';

import type { FunctionDeploymentError } from '@nangohq/sandbox';
import type {
    DBEnvironment,
    DBPlan,
    DBSyncConfig,
    DBTeam,
    DBUser,
    FunctionDeploymentCodeBody,
    FunctionDeploymentCreateSuccess,
    FunctionDeploymentTemplateBody
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const sandboxApiKeyTimeoutBufferMs = 60 * 1000;

export type DeployFunctionServiceErrorCode =
    | 'customer_api_key_required'
    | 'integration_not_found'
    | 'invalid_request'
    | 'deployment_creation_failed'
    | 'function_error'
    | 'deployment_failed';

export type DeployTemplateServiceErrorCode =
    | 'integration_not_found'
    | 'template_not_found'
    | 'ambiguous_function'
    | 'plan_limit'
    | 'template_already_deployed'
    | 'non_runnable_template'
    | 'template_deployment_failed'
    | 'deployment_record_creation_failed';

type FunctionDeploymentServiceErrorCode = DeployFunctionServiceErrorCode | DeployTemplateServiceErrorCode;

export class FunctionDeploymentServiceError<TCode extends FunctionDeploymentServiceErrorCode = FunctionDeploymentServiceErrorCode> extends Error {
    public readonly code: TCode;

    constructor({ code, message, cause }: { code: TCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'FunctionDeploymentServiceError';
        this.code = code;
    }
}

export type DeployFunctionServiceError = FunctionDeploymentServiceError<DeployFunctionServiceErrorCode>;
export type DeployTemplateServiceError = FunctionDeploymentServiceError<DeployTemplateServiceErrorCode>;

export interface DeployFunctionParams {
    environment: DBEnvironment;
    body: FunctionDeploymentCodeBody;
    parentCustomerApiKeyId?: number | undefined;
}

export interface DeployTemplateParams {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    user?: Pick<DBUser, 'id' | 'email' | 'name'> | undefined;
    body: FunctionDeploymentTemplateBody;
}

export async function deployFunction({
    environment,
    body,
    parentCustomerApiKeyId
}: DeployFunctionParams): Promise<Result<FunctionDeploymentCreateSuccess, DeployFunctionServiceError>> {
    if (!parentCustomerApiKeyId) {
        return Err(
            new FunctionDeploymentServiceError({
                code: 'customer_api_key_required',
                message: 'Function deployments can only be started from a customer API key'
            })
        );
    }

    const providerConfig = await configService.getProviderConfig(body.integration_id, environment.id);
    if (!providerConfig?.id) {
        return Err(
            new FunctionDeploymentServiceError({
                code: 'integration_not_found',
                message: `Integration '${body.integration_id}' was not found`
            })
        );
    }

    const existingSyncConfig = await getSyncConfigRaw({
        environmentId: environment.id,
        config_id: providerConfig.id,
        name: body.function_name,
        isAction: body.function_type === 'action'
    });

    if (isProtectedExistingFunction(existingSyncConfig)) {
        return Err(
            new FunctionDeploymentServiceError({
                code: 'invalid_request',
                message: `Cannot overwrite existing function '${body.function_name}'`
            })
        );
    }

    const allowDestructiveDeploy = shouldAllowDestructiveDeploy(existingSyncConfig, body.allow_destructive ?? false);
    const deploymentResult = await createFunctionDeployment({
        environmentId: environment.id,
        request: {
            type: 'function',
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            ...(body.version ? { version: body.version } : {}),
            allow_destructive: allowDestructiveDeploy
        }
    });
    if (deploymentResult.isErr()) {
        return Err(
            new FunctionDeploymentServiceError({
                code: 'deployment_creation_failed',
                message: 'Failed to create function deployment',
                cause: deploymentResult.error
            })
        );
    }

    const deployment = deploymentResult.value;
    let prepared: Awaited<ReturnType<typeof prepareAsyncDeploy>> | null = null;
    try {
        const sandboxApiKey = await createDeploySandboxApiKey(parentCustomerApiKeyId, environment.id, deployment.id);
        if (sandboxApiKey.isErr()) {
            throw sandboxApiKey.error;
        }

        const callbackUrl = new URL(`/functions/deployments/${deployment.id}/result`, baseUrl).toString();
        prepared = await prepareAsyncDeploy({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            nango_secret_key: sandboxApiKey.value,
            nango_host: baseUrl,
            deployment_id: deployment.id,
            callback_url: callbackUrl,
            ...(body.version ? { version: body.version } : {}),
            allow_destructive: allowDestructiveDeploy
        });

        const running = await markFunctionDeploymentRunning({
            environmentId: environment.id,
            id: deployment.id,
            sandboxId: prepared.sandboxId,
            startedAt: prepared.startedAt,
            executionTimeoutAt: prepared.executionTimeoutAt
        });
        if (!running) {
            throw new Error(`Failed to mark function deployment '${deployment.id}' as running`);
        }

        await prepared.start();
        return Ok(toFunctionDeploymentCreate(running));
    } catch (err) {
        await prepared?.kill().catch(() => {
            // Still mark the deployment as failed if sandbox cleanup fails.
        });
        await markFunctionDeploymentFailed({
            environmentId: environment.id,
            id: deployment.id,
            error: toFunctionDeploymentError(err)
        });

        if (err instanceof FunctionError) {
            return Err(new FunctionDeploymentServiceError({ code: 'function_error', message: err.message, cause: err }));
        }
        return Err(new FunctionDeploymentServiceError({ code: 'deployment_failed', message: 'Failed to start function deployment', cause: err }));
    }
}

export async function deployTemplate({
    account,
    environment,
    plan,
    user,
    body
}: DeployTemplateParams): Promise<Result<FunctionDeploymentCreateSuccess, DeployTemplateServiceError>> {
    const outcome = await deployIntegrationTemplate({
        environment,
        account,
        plan,
        user,
        providerConfigKey: body.integration_id,
        name: body.template,
        type: body.function_type
    });

    if (!outcome.ok) {
        switch (outcome.reason) {
            case 'integration_not_found':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'integration_not_found',
                        message: `Integration '${body.integration_id}' was not found`
                    })
                );
            case 'template_not_found':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'template_not_found',
                        message: `No template named '${body.template}' exists for this integration`
                    })
                );
            case 'ambiguous_template':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'ambiguous_function',
                        message: `'${body.template}' exists as both a sync and an action; specify 'function_type' to disambiguate`
                    })
                );
            case 'plan_limit':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'plan_limit',
                        message: "Can't enable more functions, upgrade or extend your trial period"
                    })
                );
            case 'template_already_deployed':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'template_already_deployed',
                        message: `'${body.template}' is already deployed on this integration`
                    })
                );
            case 'non_runnable_type':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'non_runnable_template',
                        message: `Template '${body.template}' cannot be deployed as a function`,
                        cause: outcome.cause
                    })
                );
            case 'failed_to_deploy':
                return Err(
                    new FunctionDeploymentServiceError({
                        code: 'template_deployment_failed',
                        message: 'Failed to deploy the template',
                        cause: outcome.cause
                    })
                );
            default: {
                const exhaustiveCheck: never = outcome.reason;
                return exhaustiveCheck;
            }
        }
    }

    const { result, type } = outcome;
    const version = result.version ?? '';
    const deployment = await createSucceededFunctionDeployment({
        environmentId: environment.id,
        request: {
            type: 'template',
            integration_id: body.integration_id,
            template: body.template,
            function_name: result.name,
            function_type: type
        },
        output: `Successfully deployed the functions:\n- ${result.name}@${version}`,
        deployedFunctions: [{ name: result.name, version }]
    });
    if (deployment.isErr()) {
        return Err(
            new FunctionDeploymentServiceError({
                code: 'deployment_record_creation_failed',
                message: 'Template was deployed but its deployment record could not be created',
                cause: deployment.error
            })
        );
    }

    return Ok(deployment.value);
}

export function toFunctionDeploymentError(err: unknown): FunctionDeploymentError {
    if (err instanceof FunctionError) {
        return {
            code: err.code,
            message: err.message,
            ...(err.payload !== undefined ? { payload: err.payload } : {})
        };
    }

    return {
        code: 'deployment_error',
        message: stringifyError(err)
    };
}

function isProtectedExistingFunction(existingSyncConfig: Pick<DBSyncConfig, 'source'> | null): boolean {
    return Boolean(existingSyncConfig && existingSyncConfig.source !== 'standalone');
}

function shouldAllowDestructiveDeploy(existingSyncConfig: Pick<DBSyncConfig, 'source'> | null, allowDestructive: boolean): boolean {
    return Boolean(allowDestructive && existingSyncConfig?.source === 'standalone');
}

async function createDeploySandboxApiKey(parentApiKeyId: number, environmentId: number, deploymentId: string) {
    return await sandboxApiKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId,
        environmentId,
        purpose: 'deploy',
        deploymentId,
        expiresAt: new Date(Date.now() + deploySandboxTimeoutMs + sandboxApiKeyTimeoutBufferMs)
    });
}
