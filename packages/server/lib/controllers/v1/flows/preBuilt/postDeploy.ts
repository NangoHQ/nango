import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PostPreBuiltDeploy } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, deployPreBuilt, flowService, syncManager } from '@nangohq/shared';
import { getOrchestrator } from '../../../../utils/utils.js';
import { flowConfig } from '../../../sync/deploy/validation.js';
import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';

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

    const { environment, account } = res.locals;
    const environmentId = environment.id;

    const config = await configService.getIdByProviderConfigKey(environmentId, body.providerConfigKey);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    if (account.is_capped) {
        const isCapped = await connectionService.shouldCapUsage({ providerConfigKey: body.providerConfigKey, environmentId, type: 'deploy' });
        if (isCapped) {
            res.status(400).send({ error: { code: 'resource_capped' } });
            return;
        }
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
                ...flow,
                public_route: body.provider,
                provider: body.provider,
                providerConfigKey: body.providerConfigKey,
                model_schema: flow.models as unknown as any,
                is_public: true,
                type: flow.type!,
                models: flow.returns,
                track_deletes: flow.track_deletes === true,
                metadata: { description: flow.description, scopes: flow.scopes }
            }
        ],
        logContextGetter,
        orchestrator
    });

    if (!success || response === null) {
        res.status(503).send({ error: { code: 'failed_to_deploy', errors: [error!] } });
        return;
    }

    await syncManager.triggerIfConnectionsExist(response.result, environmentId, logContextGetter, orchestrator);

    res.status(201).send({ data: { id: response.result[0]!.id! } });
});
