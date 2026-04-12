import { metrics } from '@nangohq/utils';

import { envs } from '../../env.js';
import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type knex from 'knex';

export class BackpressureMonitoringDaemon extends SchedulerDaemon {
    constructor({ db, abortSignal, onError }: { db: knex.Knex; abortSignal: AbortSignal; onError: (err: Error) => void }) {
        super({
            name: 'BackpressureMonitoring',
            db,
            tickIntervalMs: envs.ORCHESTRATOR_BACKPRESSURE_MONITORING_TICK_INTERVAL_MS,
            abortSignal,
            onError
        });
    }

    async run(): Promise<void> {
        const result = await tasks.getGroupsWithBackpressure(this.db, { limit: envs.ORCHESTRATOR_BACKPRESSURE_MONITORING_TOP_N });
        if (result.isErr()) {
            logger.error(result.error);
            return;
        }

        for (const { group_key, queued } of result.value) {
            const primitive = group_key.split(':')[0]!;
            metrics.gauge(metrics.Types.ORCH_QUEUE_BACKPRESSURE, queued, { groupKey: group_key, primitive });
        }
    }
}
