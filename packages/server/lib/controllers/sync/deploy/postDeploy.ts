import { z } from 'zod';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostDeploy } from '@nangohq/types';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { AnalyticsTypes, analytics, deploy, errorManager, getAndReconcileDifferences } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import { flowConfigs, jsonSchema, postConnectionScriptsByProvider } from './postConfirmation.js';

const orchestrator = getOrchestrator();

const validation = z
    .object({
        flowConfigs: flowConfigs,
        postConnectionScriptsByProvider: postConnectionScriptsByProvider,
        jsonSchema: jsonSchema.optional(),
        nangoYamlBody: z.string(),
        reconcile: z.boolean(),
        debug: z.boolean(),
        singleDeployMode: z.boolean().optional().default(false)
    })
    .strict();

export const postDeploy = asyncWrapper<PostDeploy>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const body: PostDeploy['Body'] = val.data;
    const { environment, account } = res.locals;

    const {
        success,
        error,
        response: syncConfigDeployResult
    } = await deploy({
        environment,
        account,
        flows: body.flowConfigs,
        nangoYamlBody: body.nangoYamlBody,
        postConnectionScriptsByProvider: body.postConnectionScriptsByProvider,
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

    void analytics.trackByEnvironmentId(AnalyticsTypes.SYNC_DEPLOY_SUCCESS, environment.id);

    res.send(syncConfigDeployResult.result);
});
