import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type { SchedulerEvent } from '../../config.js';
import type knex from 'knex';

export class BackpressureMonitoringDaemon extends SchedulerDaemon {
    private readonly topN: number;
    private readonly onEvent: (event: SchedulerEvent) => void;

    constructor({
        db,
        abortSignal,
        tickIntervalMs,
        topN,
        onEvent,
        onError
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        tickIntervalMs: number;
        topN: number;
        onEvent: (event: SchedulerEvent) => void;
        onError: (err: Error) => void;
    }) {
        super({
            name: 'BackpressureMonitoring',
            db,
            tickIntervalMs,
            abortSignal,
            onError
        });
        this.topN = topN;
        this.onEvent = onEvent;
    }

    async run(): Promise<void> {
        const result = await tasks.getGroupsWithBackpressure(this.db, { limit: this.topN });
        if (result.isErr()) {
            logger.error(result.error);
            return;
        }

        for (const { group_key, queued } of result.value) {
            this.onEvent({ type: 'queue_backpressure', groupKey: group_key, queued });
        }
    }
}
