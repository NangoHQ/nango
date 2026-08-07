import { getLocking } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { deployBundle, prepareDeploymentBundle } from '@nangohq/shared';
import { getLogger, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { toErrorResponse, toResponse } from './format.js';
import { validation } from './validation.js';

import type { Lock } from '@nangohq/kvstore';
import type { PostFunctionDeploymentBundle } from '@nangohq/types';

const logger = getLogger('Server.PostFunctionDeploymentBundle');

/**
 * Deploy the authoritative set of functions for an environment.
 * Each function contains its own config and compiled code.
 */
export const postFunctionDeploymentBundle = asyncWrapper<PostFunctionDeploymentBundle>(async (req, res) => {
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

    const body: PostFunctionDeploymentBundle['Body'] = val.data;
    const { account, environment } = res.locals;
    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'custom' } }, { account, environment });
    const locking = await getLocking();
    const lockKey = `lock:deployments:bundle:${account.id}:${environment.id}`;
    let lock: Lock | undefined;

    try {
        lock = await locking.acquire(lockKey, envs.DEPLOY_LOCK_TTL_MS);
    } catch (err) {
        void logCtx.error('Failed to deploy functions', { error: err });
        await logCtx.failed();
        res.status(409).send({
            error: {
                code: 'concurrent_deployment',
                message: 'A deployment is already in progress. Please wait for the current deployment to finish.'
            }
        });
        return;
    }

    try {
        const prepared = await prepareDeploymentBundle({
            environmentId: environment.id,
            reconciliationScope: body.reconciliationScope,
            functions: body.functions
        });
        if (prepared.isErr()) {
            const error = prepared.error;
            void logCtx.error('Failed to deploy functions', { error });
            await logCtx.failed();
            const response = toErrorResponse(prepared.error);
            res.status(response.status).send(response.error);
            return;
        }

        const deployed = await deployBundle({
            accountId: account.id,
            environmentId: environment.id,
            environmentName: environment.name,
            reconciliation: prepared.value
        });
        if (deployed.isErr()) {
            const error = deployed.error;
            report(error, { environmentId: environment.id });
            void logCtx.error('Failed to deploy functions', { error });
            await logCtx.failed();
            const response = toErrorResponse(error);
            res.status(response.status).send(response.error);
            return;
        }

        const response = toResponse(prepared.value);
        void logCtx.info('Successfully deployed function bundle', { functionCount: body.functions.length, ...response });
        await logCtx.success();
        res.send(response);
    } finally {
        if (lock) {
            try {
                await locking.release(lock);
            } catch (err) {
                logger.error('Error releasing function bundle deployment lock', { lock: lock.key, error: err });
            }
        }
    }
});
