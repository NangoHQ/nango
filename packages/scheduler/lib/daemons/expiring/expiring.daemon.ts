import { stringifyError } from '@nangohq/utils';
import * as tasks from '../../models/tasks.js';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';
import { envs } from '../../env.js';
import type { Task } from '../../types.js';

export class ExpiringDaemon extends SchedulerDaemon {
    private onTaskStateChange: (task: Task) => void;

    constructor({
        db,
        abortSignal,
        onTaskStateChange,
        onError
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        onTaskStateChange: (task: Task) => void;
        onError: (err: Error) => void;
    }) {
        super({
            name: 'Monitor',
            db,
            tickIntervalMs: envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS,
            abortSignal,
            onError
        });
        this.onTaskStateChange = onTaskStateChange;
    }

    async run(): Promise<void> {
        const expired = await tasks.expiresIfTimeout(this.db);
        if (expired.isErr()) {
            logger.error(`Error expiring tasks: ${stringifyError(expired.error)}`);
            return;
        }
        if (expired.value.length > 0) {
            for (const task of expired.value) {
                this.onTaskStateChange(task);
            }
            logger.info(`Expired tasks: ${JSON.stringify(expired.value.map((t) => t.id))}`);
        }
    }
}
