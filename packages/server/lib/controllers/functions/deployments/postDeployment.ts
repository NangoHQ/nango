// TODO:
// - deprecate `POST /functions/deployments`
// - move template deployment to its own endpoint `POST /functions/deployments/template`.
// - move sandbox deployment to its own endpoint alongside the other deployment endpoints.

import { createSucceededFunctionDeployment } from '@nangohq/sandbox';
import { getLogger, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { deployIntegrationTemplate } from '../../v1/flows/preBuilt/helpers.js';
import { sendStepError } from '../errors.js';
import { functionDeploymentBodySchema } from '../validation.js';

import type { DeployFunctionServiceError } from '../../../services/functionDeployment.service.js';
import type { RequestLocalsWithEnvironment } from '../../../utils/express.js';
import type { FunctionDeploymentCodeBody, FunctionDeploymentTemplateBody, PostFunctionDeployment } from '@nangohq/types';
import type { Response } from 'express';

type DeploymentResponse = Response<PostFunctionDeployment['Reply'], RequestLocalsWithEnvironment>;
const logger = getLogger('Server.Functions.Deployments');

/**
 * Deploy a catalog template onto an integration. Runs synchronously but records a deployment async job in a
 * terminal 'success' state, so the 202 response and `GET /functions/deployments/:id` mirrors the asynchronous
 * code-deploy path.
 */
async function handleDeployTemplate(res: DeploymentResponse, body: FunctionDeploymentTemplateBody): Promise<void> {
    const { environment, account, plan, user } = res.locals;

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
                res.status(404).send({ error: { code: 'integration_not_found', message: `Integration '${body.integration_id}' was not found` } });
                return;
            case 'template_not_found':
                res.status(404).send({ error: { code: 'template_not_found', message: `No template named '${body.template}' exists for this integration` } });
                return;
            case 'ambiguous_template':
                res.status(409).send({
                    error: {
                        code: 'ambiguous_function',
                        message: `'${body.template}' exists as both a sync and an action; specify 'function_type' to disambiguate`
                    }
                });
                return;
            case 'plan_limit':
                res.status(400).send({ error: { code: 'plan_limit', message: "Can't enable more functions, upgrade or extend your trial period" } });
                return;
            case 'template_already_deployed':
                res.status(409).send({ error: { code: 'template_already_deployed', message: `'${body.template}' is already deployed on this integration` } });
                return;
            case 'non_runnable_type':
                if (outcome.cause) {
                    report(outcome.cause);
                }
                res.status(500).send({ error: { code: 'server_error', message: `Template '${body.template}' cannot be deployed as a function` } });
                return;
            default:
                if (outcome.cause) {
                    report(outcome.cause);
                }
                res.status(500).send({ error: { code: 'deployment_error', message: 'Failed to deploy the template' } });
                return;
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
        report(deployment.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Template was deployed but its deployment record could not be created' } });
        return;
    }

    res.status(202).send(deployment.value);
}

/**
 * Deploy submitted TypeScript source code. Runs asynchronously in a sandbox: returns a waiting/running
 * deployment status
 */
async function handleDeployCode(res: DeploymentResponse, body: FunctionDeploymentCodeBody): Promise<void> {
    const { environment } = res.locals;
    const result = await functionDeploymentService.deployFunction({
        environment,
        body,
        ...(res.locals.apiKeyAuthSource === 'customer_key' && res.locals.apiKeyId ? { parentCustomerApiKeyId: res.locals.apiKeyId } : {})
    });
    if (result.isErr()) {
        sendDeployFunctionError(res, result.error);
        return;
    }

    res.status(202).send(result.value);
}

export const postFunctionDeployment = asyncWrapperWithEnvironment<PostFunctionDeployment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = functionDeploymentBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    if (body.type === 'template') {
        await handleDeployTemplate(res, body);
        return;
    }

    await handleDeployCode(res, body);
});

function sendDeployFunctionError(res: DeploymentResponse, error: DeployFunctionServiceError): void {
    switch (error.code) {
        case 'customer_api_key_required':
            res.status(403).send({ error: { code: 'forbidden', message: error.message } });
            return;
        case 'integration_not_found':
            res.status(404).send({ error: { code: 'integration_not_found', message: error.message } });
            return;
        case 'invalid_request':
            res.status(400).send({ error: { code: 'invalid_request', message: error.message } });
            return;
        case 'function_error':
            sendStepError({ res, error: error.cause });
            return;
        case 'deployment_creation_failed':
        case 'deployment_failed':
            sendStepError({ res, status: 500, error: error.cause });
            return;
        default: {
            const exhaustiveCheck: never = error.code;
            logger.error('Unexpected function deployment service error', { code: exhaustiveCheck });
            res.status(500).send({ error: { code: 'server_error', message: 'Internal error' } });
        }
    }
}
