// TODO:
// - deprecate `POST /functions/deployments`
// - move template deployment to its own endpoint `POST /functions/deployments/template`.
// - move sandbox deployment to its own endpoint alongside the other deployment endpoints.

import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { sendStepError } from '../errors.js';
import { functionDeploymentBodySchema } from '../validation.js';

import type { DeployFunctionServiceError, DeployTemplateServiceError } from '../../../services/functionDeployment.service.js';
import type { RequestLocalsWithEnvironment } from '../../../utils/express.js';
import type { FunctionDeploymentCodeBody, FunctionDeploymentTemplateBody, PostFunctionDeployment } from '@nangohq/types';
import type { Response } from 'express';

type DeploymentResponse = Response<PostFunctionDeployment['Reply'], RequestLocalsWithEnvironment>;

async function handleDeployTemplate(res: DeploymentResponse, body: FunctionDeploymentTemplateBody): Promise<void> {
    const { environment, account, plan, user } = res.locals;
    const result = await functionDeploymentService.deployTemplate({
        environment,
        account,
        plan,
        user,
        body
    });
    if (result.isErr()) {
        sendDeployTemplateError(res, result.error);
        return;
    }

    res.status(202).send(result.value);
}

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
            report(new Error('Unexpected function deployment service error', { cause: exhaustiveCheck }));
            res.status(500).send({ error: { code: 'server_error', message: 'Internal error' } });
        }
    }
}

function sendDeployTemplateError(res: DeploymentResponse, error: DeployTemplateServiceError): void {
    switch (error.code) {
        case 'integration_not_found':
            res.status(404).send({ error: { code: 'integration_not_found', message: error.message } });
            return;
        case 'template_not_found':
            res.status(404).send({ error: { code: 'template_not_found', message: error.message } });
            return;
        case 'ambiguous_function':
        case 'template_already_deployed':
            res.status(409).send({ error: { code: error.code, message: error.message } });
            return;
        case 'plan_limit':
            res.status(400).send({ error: { code: error.code, message: error.message } });
            return;
        case 'non_runnable_template':
            if (error.cause) {
                report(error.cause);
            }
            res.status(500).send({ error: { code: 'server_error', message: error.message } });
            return;
        case 'template_deployment_failed':
            if (error.cause) {
                report(error.cause);
            }
            res.status(500).send({ error: { code: 'deployment_error', message: error.message } });
            return;
        case 'deployment_record_creation_failed':
            if (error.cause) {
                report(error.cause);
            }
            res.status(500).send({ error: { code: 'server_error', message: error.message } });
            return;
        default: {
            const exhaustiveCheck: never = error.code;
            report(new Error('Unexpected template deployment service error', { cause: exhaustiveCheck }));
            res.status(500).send({ error: { code: 'server_error', message: 'Internal error' } });
        }
    }
}
