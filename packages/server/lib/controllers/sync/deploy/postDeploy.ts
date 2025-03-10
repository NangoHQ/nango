import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostDeploy } from '@nangohq/types';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { AnalyticsTypes, analytics, NangoError, cleanIncomingFlow, deploy, errorManager, getAndReconcileDifferences } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { logContextGetter } from '@nangohq/logs';
import type { Lock } from '@nangohq/kvstore';
import { getLocking } from '@nangohq/kvstore';
import { validationWithNangoYaml as validation } from './validation.js';

const orchestrator = getOrchestrator();

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

    // we don't allow concurrent deploys so we need to lock this
    // and reject this deploy if there is already a deploy in progress
    const locking = await getLocking();
    const ttlMs = 60 * 1000;
    const lockKey = `lock:deployService:deploy:${account.id}:${environment.id}`;
    let lock: Lock | undefined;

    try {
        lock = await locking.acquire(lockKey, ttlMs);
    } catch {
        const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'custom' } }, { account, environment });
        const error = new NangoError('concurrent_deployment');

        await logCtx.error('Failed to deploy scripts', { error });
        await logCtx.failed();

        errorManager.errResFromNangoErr(res, error);
        return;
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
        if (lock) {
            await locking.release(lock);
        }
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
            if (lock) {
                await locking.release(lock);
            }
            res.status(500).send({
                error: { code: 'server_error', message: 'There was an error deploying syncs, please check the activity tab and report this issue to support' }
            });
            return;
        }
    }

    void analytics.trackByEnvironmentId(AnalyticsTypes.SYNC_DEPLOY_SUCCESS, environment.id);

    if (lock) {
        await locking.release(lock);
    }

    res.send(syncConfigDeployResult.result);
});
