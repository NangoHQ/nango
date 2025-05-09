import type { MessagePort } from 'node:worker_threads';
import { stringifyError } from '@nangohq/utils';
import * as tasks from '../../models/tasks.js';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';
import { SchedulerWorker, SchedulerWorkerChild } from '../worker.js';
import { envs } from '../../env.js';

export class MonitorWorker extends SchedulerWorker {
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        super({
            workerUrl: new URL('../../../dist/workers/monitor/monitor.worker.boot.js', import.meta.url),
            name: 'Monitor',
            databaseUrl: databaseUrl,
            databaseSchema
        });
    }
}

export class MonitorChild extends SchedulerWorkerChild {
    constructor(parent: MessagePort, db: knex.Knex) {
        super({
            name: 'Monitor',
            parent,
            db,
            tickIntervalMs: envs.ORCHESTRATOR_MONITOR_TICK_INTERVAL_MS
        });
    }

    async run(): Promise<void> {
        const expired = await tasks.expiresIfTimeout(this.db);
        if (expired.isErr()) {
            logger.error(`Error expiring tasks: ${stringifyError(expired.error)}`);
        } else {
            if (expired.value.length > 0) {
                const taskIds = expired.value.map((t) => t.id);
                if (taskIds.length > 0 && !this.cancelled) {
                    this.parent.postMessage({ ids: taskIds }); // Notifying parent that tasks have expired
                }
                logger.info(`Expired tasks: ${JSON.stringify(expired.value.map((t) => t.id))}`);
            }
        }
    }
}
