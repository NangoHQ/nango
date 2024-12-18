import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PatchFlowEnable } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { configService, connectionService, enableScriptConfig, getSyncConfigById, syncManager } from '@nangohq/shared';
import { validationBody, validationParams } from './patchDisable.js';
import { logContextGetter } from '@nangohq/logs';
import { getOrchestrator } from '../../../../utils/utils.js';

const orchestrator = getOrchestrator();
export const patchFlowEnable = asyncWrapper<PatchFlowEnable>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const val = validationBody.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const body: PatchFlowEnable['Body'] = val.data;
    const { environment, account } = res.locals;

    const syncConfig = await getSyncConfigById(environment.id, valParams.data.id);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'unknown_sync_config' } });
        return;
    }

    const config = await configService.getIdByProviderConfigKey(environment.id, body.providerConfigKey);
    if (!config) {
        res.status(400).send({ error: { code: 'unknown_provider' } });
        return;
    }

    if (account.is_capped) {
        const isCapped = await connectionService.shouldCapUsage({ providerConfigKey: body.providerConfigKey, environmentId: environment.id, type: 'activate' });
        if (isCapped) {
            res.status(400).send({ error: { code: 'resource_capped' } });
            return;
        }
    }

    const updated = await enableScriptConfig({ id: valParams.data.id, environmentId: environment.id });

    if (updated > 0) {
        await syncManager.triggerIfConnectionsExist(
            [{ ...syncConfig, name: syncConfig.sync_name, providerConfigKey: body.providerConfigKey }],
            environment.id,
            logContextGetter,
            orchestrator
        );
        res.status(200).send({ data: { success: true } });
    } else {
        res.status(400).send({ data: { success: false } });
    }
});
