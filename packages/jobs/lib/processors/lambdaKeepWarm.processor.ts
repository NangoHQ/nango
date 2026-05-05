import db from '@nangohq/database';
import { Subscriber } from '@nangohq/pubsub';
import { getPlan } from '@nangohq/shared';
import { getLogger, report, useLambdaKeepWarm } from '@nangohq/utils';

import { envs } from '../env.js';
import { invokeLambdaReadinessCheckEvent } from '../runner/lambda.js';
import { getLambdaFleet } from '../runtime/runtimes.js';
import { getLambdaTenantIdFromAccountEnv, getRoutingIdFromPlan } from '../utils/lambda.js';

import type { Transport } from '@nangohq/pubsub';
import type { Event } from '@nangohq/types';

type LambdaKeepWarmInvokeEvent = Extract<Event, { subject: 'lambda_keep_warm' }>;

const logger = getLogger('Jobs.LambdaKeepWarm');

export class LambdaKeepWarmProcessor {
    private subscriber: Subscriber;

    constructor({ transport }: { transport: Transport }) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        if (!useLambdaKeepWarm) {
            logger.info('Lambda keep-warm subscriber skipped - lambda keep-warm not enabled');
            return;
        }

        logger.info('Starting lambda keep-warm subscriber...', {
            subscribeConcurrency: envs.LAMBDA_KEEP_WARM_SUBSCRIBE_CONCURRENCY
        });

        this.subscriber.subscribe({
            consumerGroup: 'jobs',
            subject: 'lambda_keep_warm',
            concurrency: envs.LAMBDA_KEEP_WARM_SUBSCRIBE_CONCURRENCY,
            callback: async (event) => {
                try {
                    await processKeepWarm(event);
                } catch (err) {
                    report(new Error('lambda_keep_warm_handler_failed', { cause: err }), { event });
                }
            }
        });
    }
}

async function processKeepWarm(event: LambdaKeepWarmInvokeEvent): Promise<void> {
    if (!useLambdaKeepWarm) {
        return;
    }

    const { accountId, environmentId, provisionedConcurrency } = event.payload;

    const planRes = await getPlan(db.readOnly, { accountId });
    if (planRes.isErr()) {
        report(new Error('lambda_keep_warm_get_plan_failed', { cause: planRes.error }), { accountId });
        return;
    }
    if (!planRes.value.lambda_tenant_isolation) {
        return;
    }

    const fleet = getLambdaFleet();
    if (!fleet) {
        report(new Error('lambda_keep_warm_no_fleet'));
        return;
    }

    const routingId = getRoutingIdFromPlan(planRes.value);
    const nodeRes = await fleet.getRunningNode(routingId);
    if (nodeRes.isErr()) {
        report(new Error('lambda_keep_warm_get_node_failed', { cause: nodeRes.error }), { accountId, environmentId, routingId });
        return;
    }
    const url = nodeRes.value.url;
    if (!url) {
        report(new Error('lambda_keep_warm_node_no_url'), { accountId, environmentId, routingId });
        return;
    }

    const tenantId = getLambdaTenantIdFromAccountEnv(accountId, environmentId);
    const n = Math.max(1, Math.floor(provisionedConcurrency));

    const results = await Promise.all(Array.from({ length: n }, () => invokeLambdaReadinessCheckEvent({ functionArn: url, tenantId })));

    for (const r of results) {
        if (r.isErr()) {
            report(new Error('lambda_keep_warm_invoke_failed', { cause: r.error }), { accountId, environmentId });
        }
    }
}
