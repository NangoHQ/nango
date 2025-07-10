import { z } from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { configService, flowService, getSyncConfigById, upgradeTemplate } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { flowConfig } from '../../../sync/deploy/validation.js';

import type { PutUpgradePreBuiltFlow } from '@nangohq/types';

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

    const integration = await configService.getProviderConfig(body.providerConfigKey, environment.id);
    if (!integration) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    const template = flowService.getFlowByIntegrationAndName({ provider: body.provider, type: body.type, scriptName: body.scriptName });
    if (!template) {
        res.status(400).send({ error: { code: 'unknown_flow' } });
        return;
    }

    if (template.version !== body.upgradeVersion) {
        res.status(400).send({ error: { code: 'invalid_version' } });
        return;
    }

    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });
    const result = await upgradeTemplate({
        environment,
        team: account,
        integration,
        syncConfig,
        template,
        logCtx
    });
    if (result.isErr()) {
        res.status(400).send({ error: { code: 'upgrade_failed', message: result.error.message } });
        return;
    }

    res.send({ success: true });
});
