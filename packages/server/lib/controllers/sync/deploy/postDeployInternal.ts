import { z } from 'zod';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { PostDeployInternal } from '@nangohq/types';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { deploy, errorManager, getAndReconcileDifferences, environmentService, configService, connectionService, cleanIncomingFlow } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import { validationWithNangoYaml as validation } from './validation.js';

const orchestrator = getOrchestrator();

const queryStringValidation = z
    .object({
        customEnvironment: z.string().min(1)
    })
    .strict();

export const postDeployInternal = asyncWrapper<PostDeployInternal>(async (req, res) => {
    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);

    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const body: PostDeployInternal['Body'] = val.data;

    const { account } = res.locals;

    if (account.uuid !== process.env['NANGO_SHARED_DEV_ACCOUNT_UUID']) {
        res.status(403).send({ error: { code: 'forbidden', message: 'This endpoint is only available for Nango internal use' } });
        return;
    }

    const environmentName = queryParamValues.data.customEnvironment;

    let environment = await environmentService.getByEnvironmentName(account.id, environmentName);

    if (!environment) {
        environment = await environmentService.createEnvironment(account.id, environmentName);

        if (!environment) {
            res.status(500).send({
                error: { code: 'environment_creation_error', message: 'There was an error creating the environment, please try again' }
            });
            return;
        }

        // since we're making a new environment, we want to make sure the config creds and
        // connections are copied from the dev environment
        // so that the syncs and actions can be run right away
        const allProviderConfigKeys = body.flowConfigs.map((flow) => flow.providerConfigKey);
        const uniqueProviderConfigKeys = [...new Set(allProviderConfigKeys)];

        for (const providerConfigKey of uniqueProviderConfigKeys) {
            const devEnvironment = await environmentService.getByEnvironmentName(account.id, 'dev');
            if (devEnvironment) {
                const copiedResponse = await configService.copyProviderConfigCreds(devEnvironment.id, environment.id, providerConfigKey);

                if (copiedResponse) {
                    const { copiedFromId, copiedToId } = copiedResponse;
                    const connections = await connectionService.getConnectionsByEnvironmentAndConfigId(devEnvironment.id, copiedFromId);
                    if (connections.length > 0) {
                        await connectionService.copyConnections(connections, environment.id, copiedToId);
                    }
                }
            }
        }
    }

    const {
        success,
        error,
        response: syncConfigDeployResult
    } = await deploy({
        environment,
        account,
        flows: cleanIncomingFlow(body.flowConfigs),
        nangoYamlBody: body.nangoYamlBody,
        onEventScriptsByProvider: body.onEventScriptsByProvider,
        debug: body.debug,
        jsonSchema: req.body.jsonSchema,
        logContextGetter,
        orchestrator
    });

    if (!success || !syncConfigDeployResult) {
        errorManager.errResFromNangoErr(res, error);
        return;
    }

    if (body.reconcile) {
        const logCtx = syncConfigDeployResult.logCtx;
        const success = await getAndReconcileDifferences({
            environmentId: environment.id,
            flows: body.flowConfigs,
            performAction: body.reconcile,
            debug: body.debug,
            singleDeployMode: body.singleDeployMode,
            logCtx,
            logContextGetter,
            orchestrator
        });
        if (!success) {
            res.status(500).send({
                error: { code: 'server_error', message: 'There was an error deploying syncs, please check the activity tab and report this issue to support' }
            });
            return;
        }
    }

    res.send(syncConfigDeployResult.result);
});
