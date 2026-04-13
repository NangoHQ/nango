import { envs } from '../../env.js';
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

    run(): Promise<void> {
        // Backpressure monitoring is intentionally disabled to avoid querying
        // whether groups have reached their max concurrency.
        return Promise.resolve();
    }
}
