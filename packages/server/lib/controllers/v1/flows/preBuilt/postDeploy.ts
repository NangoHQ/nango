import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { deployIntegrationTemplate } from './helpers.js';
import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { flowConfig } from '../../../sync/deploy/validation.js';

import type { PostPreBuiltDeploy } from '@nangohq/types';

const validation = z
    .object({
        provider: providerSchema,
        providerConfigKey: providerConfigKeySchema,
        scriptName: scriptNameSchema,
        type: flowConfig.shape.type
    })
    .strict();

export const postPreBuiltDeploy = asyncWrapper<PostPreBuiltDeploy>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const body: PostPreBuiltDeploy['Body'] = val.data;
    const { environment, account, plan, user } = res.locals;

    const outcome = await deployIntegrationTemplate({
        environment,
        account,
        plan,
        user,
        providerConfigKey: body.providerConfigKey,
        name: body.scriptName,
        type: body.type
    });

    if (!outcome.ok) {
        switch (outcome.reason) {
            case 'integration_not_found':
                res.status(400).send({ error: { code: 'unknown_provider' } });
                return;
            case 'plan_limit':
                res.status(400).send({ error: { code: 'plan_limit', message: "Can't enable more script, upgrade or extend your trial period" } });
                return;
            case 'template_not_found':
                res.status(400).send({ error: { code: 'invalid_body', message: 'No template exists for this provider and script name' } });
                return;
            default:
                res.status(503).send({ error: { code: 'failed_to_deploy', errors: outcome.cause ? [outcome.cause] : [] } });
                return;
        }
    }

    res.status(201).send({ data: { id: outcome.result.id! } });
});
