import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PostPreBuiltDeploy } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { flowConfig } from '../../../sync/deploy/postConfirmation.js';
import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, deployPreBuilt, syncManager } from '@nangohq/shared';
import { getOrchestrator } from '../../../../utils/utils.js';

const validation = z
    .object({
        flow: flowConfig.extend({
            provider: z.string().min(1).max(255),
            name: z.string().min(1).max(255),
            is_public: z.literal(true)
        })
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
    const flow = body.flow;

    const { environment, account } = res.locals;
    const environmentId = environment.id;

    let integration;
    if (flow.providerConfigKey) {
        integration = await configService.getConfigIdByProviderConfigKey(flow.providerConfigKey, environmentId);
    } else {
        integration = await configService.getConfigIdByProvider(flow.provider, environmentId);
    }

    if (!integration) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    if (account.is_capped && flow.providerConfigKey) {
        const isCapped = await connectionService.shouldCapUsage({ providerConfigKey: flow.providerConfigKey, environmentId, type: 'activate' });

        if (isCapped) {
            res.status(400).send({ error: { code: 'resource_capped' } });
            return;
        }
    }

    const { success, error, response } = await deployPreBuilt({
        environment,
        account,
        configs: [flow],
        nangoYamlBody: '',
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
