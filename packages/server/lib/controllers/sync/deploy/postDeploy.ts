import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { cleanIncomingFlow, deploy, errorManager, getAndReconcileDifferences, NangoError, productTracking, startTrial } from '@nangohq/shared';
import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { getCliContext } from '../../../middleware/cliVersionCheck.js';
import { startFunctionDeletion } from '../../../tasks/startFunctionDeletion.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { validationWithNangoYaml as validation } from './validation.js';

import type { Lock } from '@nangohq/kvstore';
import type { PostDeploy } from '@nangohq/types';

const logger = getLogger('Server.PostDeploy');
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
    const { environment, account, plan } = res.locals;

    const { cliVersion } = getCliContext(req);
    const trackingProperties: Record<string, string | number | boolean> = {
        'cli-version': cliVersion || 'unknown',
        source: body.source ?? 'repo',
        'flow-count': body.flowConfigs.length
    };

    // Prevent concurrent deploys per environment, fail immediately if another deploy is in flight.
    const locking = await getLocking();
    const ttlMs = process.env['DEPLOY_LOCK_TTL_MS'] ? parseInt(process.env['DEPLOY_LOCK_TTL_MS']) : 10 * 60 * 1000; // max expected deploy duration
    const lockKey = `lock:deployService:deploy:${account.id}:${environment.id}`;
    let lock: Lock | undefined;

    try {
        lock = await locking.acquire(lockKey, ttlMs);
    } catch {
        const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'custom' } }, { account, environment });
        const error = new NangoError('concurrent_deployment');

        void logCtx.error('Failed to deploy scripts', { error });
        await logCtx.failed();

        errorManager.errResFromNangoErr(res, error);
        return;
    }

    try {
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
            aggregatedJsonSchema: body.jsonSchema,
            logContextGetter,
            sdkVersion: body.sdkVersion,
            orchestrator,
            source: body.source ?? 'repo'
        });

        if (plan && !plan.trial_end_at && plan.auto_idle) {
            await startTrial(db.knex, plan);
            productTracking.track({ name: 'account:trial:started', team: account });
        }

        if (!success || !syncConfigDeployResult) {
            productTracking.track({ name: 'deploy:error', team: account, eventProperties: { ...trackingProperties, 'error-code': error?.type || 'unknown' } });
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
                deployMode: body.deployMode,
                logCtx,
                logContextGetter,
                orchestrator,
                onFunctionDeleted: ({ syncConfigId, models }) => startFunctionDeletion({ syncConfigId, environmentId: environment.id, models })
            });
            if (!success) {
                productTracking.track({ name: 'deploy:error', team: account, eventProperties: { ...trackingProperties, 'error-code': 'reconcile_failed' } });
                res.status(500).send({
                    error: {
                        code: 'server_error',
                        message: 'There was an error deploying syncs, please check the activity tab and report this issue to support'
                    }
                });
                return;
            }
        }

        productTracking.track({ name: 'deploy:success', team: account, eventProperties: trackingProperties });

        res.send(syncConfigDeployResult.result);
    } finally {
        if (lock) {
            try {
                await locking.release(lock);
            } catch (err) {
                logger.error('Error releasing lock', { lock: lock.key, error: err });
            }
        }
    }
});
