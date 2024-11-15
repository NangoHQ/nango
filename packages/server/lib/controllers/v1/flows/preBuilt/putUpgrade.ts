import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PutUpgradePreBuiltFlow } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import { configService, flowService, getSyncConfigById, upgradePreBuilt as upgradePrebuiltFlow } from '@nangohq/shared';
import { flowConfig } from '../../../sync/deploy/validation.js';
import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';

const validation = z
    .object({
        id: z.number(),
        provider: providerSchema,
        scriptName: scriptNameSchema,
        type: flowConfig.shape.type,
        upgradeVersion: z.string(),
        lastDeployed: z.string(),
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const putUpgradePreBuilt = asyncWrapper<PutUpgradePreBuiltFlow>(async (req, res) => {
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

    const body: PutUpgradePreBuiltFlow['Body'] = val.data;
    const { environment, account } = res.locals;

    const syncConfig = await getSyncConfigById(environment.id, body.id);
    if (!syncConfig) {
        res.status(400).send({
            error: { code: 'unknown_sync_config' }
        });
        return;
    }

    const config = await configService.getProviderConfig(body.providerConfigKey, environment.id);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    const flow = flowService.getFlowByIntegrationAndName({ provider: body.provider, type: body.type, scriptName: body.scriptName });
    if (!flow) {
        res.status(400).send({ error: { code: 'unknown_flow' } });
        return;
    }

    if (flow.version !== body.upgradeVersion) {
        res.status(400).send({ error: { code: 'invalid_version' } });
        return;
    }

    const result = await upgradePrebuiltFlow({
        environment,
        account,
        config,
        syncConfig,
        flow,
        logContextGetter
    });

    if (result.isOk()) {
        res.send({ success: true });
        return;
    }

    res.status(400).send({ error: { code: 'upgrade_failed', message: result.error.message } });
});
