import { setTimeout } from 'node:timers/promises';

import { stringifyError } from '@nangohq/utils';

import { envs } from '../../env.js';
import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type { Task } from '../../types.js';
import type knex from 'knex';

export class ExpiringDaemon extends SchedulerDaemon {
    private onExpiring: (task: Task) => void;

    constructor({
        db,
        abortSignal,
        onExpiring,
        onError
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        onExpiring: (task: Task) => void;
        onError: (err: Error) => void;
    }) {
        super({
            name: 'Monitor',
            db,
            tickIntervalMs: envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS,
            abortSignal,
            onError
        });
        this.onExpiring = onExpiring;
    }

    async run(): Promise<void> {
        return this.db.transaction(async (trx) => {
            // Try to acquire a lock to prevent multiple instances from expiring at the same time
            const res = await trx.raw<{ rows: { lock_expire: boolean }[] }>('SELECT pg_try_advisory_xact_lock(?) AS lock_expire', [5003001108]);
            const lockGranted = res?.rows.length > 0 ? res.rows[0]!.lock_expire : false;

            if (lockGranted) {
                const expired = await tasks.expiresIfTimeout(trx);
                if (expired.isErr()) {
                    logger.error(`Error expiring tasks: ${stringifyError(expired.error)}`);
                    return;
                }
                if (expired.value.length > 0) {
                    for (const task of expired.value) {
                        this.onExpiring(task);
                    }
                    logger.info(`Expired tasks: ${JSON.stringify(expired.value.map((t) => t.id))}`);
                }
            } else {
                await setTimeout(1000); // wait for 1s to prevent retrying too quickly
            }
        });
    }
}
