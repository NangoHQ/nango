import { z } from 'zod';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, deployTemplate, flowService, productTracking, startTrial, syncManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../utils/utils.js';
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

const orchestrator = getOrchestrator();

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
    const environmentId = environment.id;

    const config = await configService.getIdByProviderConfigKey(environmentId, body.providerConfigKey);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    if (plan && plan.trial_end_at && plan.trial_end_at.getTime() < Date.now()) {
        res.status(400).send({ error: { code: 'plan_limit', message: "Can't enable more script, upgrade or extend your trial period" } });
        return;
    }
    if (plan && !plan.trial_end_at && plan.auto_idle) {
        await startTrial(db.knex, plan);
        productTracking.track({ name: 'account:trial:started', team: account, user });
    }

    const isCapped = await connectionService.shouldCapUsage({
        providerConfigKey: body.providerConfigKey,
        environmentId,
        type: 'deploy',
        team: account,
        plan
    });
    if (isCapped) {
        res.status(400).send({
            error: { code: 'resource_capped', message: `Your plan only allows ${plan?.connection_with_scripts_max} connections with scripts` }
        });
        return;
    }

    const flow = flowService.getFlowByIntegrationAndName({ provider: body.provider, type: body.type, scriptName: body.scriptName });
    if (!flow) {
        res.status(400).send({ error: { code: 'unknown_flow' } });
        return;
    }

    const resDeploy = await deployTemplate({
        environment,
        account,
        template: flow,
        deployInfo: { integrationId: body.providerConfigKey, provider: body.provider },
        logContextGetter
    });
    if (resDeploy.isErr()) {
        res.status(503).send({ error: { code: 'failed_to_deploy', errors: [resDeploy.error] } });
        return;
    }

    const deploy = resDeploy.value;
    await syncManager.triggerIfConnectionsExist({ flows: [deploy.result], environmentId, logContextGetter, orchestrator });

    res.status(201).send({ data: { id: deploy.result.id! } });
});
