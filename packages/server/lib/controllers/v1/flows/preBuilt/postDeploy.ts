import { z } from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, deployPreBuilt, flowService, syncManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../utils/utils.js';
import { flowConfig } from '../../../sync/deploy/validation.js';

import type { NangoModel, PostPreBuiltDeploy } from '@nangohq/types';

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

    const { environment, account, plan } = res.locals;
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

    const isCapped = await connectionService.shouldCapUsage({
        providerConfigKey: body.providerConfigKey,
        environmentId,
        type: 'deploy',
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

    const { success, error, response } = await deployPreBuilt({
        environment,
        account,
        configs: [
            {
                endpoints: flow.endpoints,
                name: flow.name,
                runs: flow.runs || null,
                attributes: flow.attributes,
                auto_start: flow.auto_start,
                public_route: body.provider,
                provider: body.provider,
                providerConfigKey: body.providerConfigKey,
                model_schema: flow.models as unknown as NangoModel[],
                is_public: true,
                type: flow.type!,
                models: flow.returns,
                track_deletes: flow.track_deletes === true,
                metadata: { description: flow.description, scopes: flow.scopes },
                input: flow.input
            }
        ],
        logContextGetter,
        orchestrator
    });

    if (!success || response === null) {
        res.status(503).send({ error: { code: 'failed_to_deploy', errors: [error!] } });
        return;
    }

    await syncManager.triggerIfConnectionsExist({ flows: response.result, environmentId, logContextGetter, orchestrator });

    res.status(201).send({ data: { id: response.result[0]!.id! } });
});
