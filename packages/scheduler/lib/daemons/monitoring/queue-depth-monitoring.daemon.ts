import { metrics } from '@nangohq/utils';

import { envs } from '../../env.js';
import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type knex from 'knex';

export class QueueDepthMonitoringDaemon extends SchedulerDaemon {
    private readonly groupKeyPattern: string;
    private readonly primitive: string;
    private readonly threshold: number;

    constructor({
        db,
        abortSignal,
        onError,
        groupKeyPattern,
        threshold
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        onError: (err: Error) => void;
        groupKeyPattern: string;
        threshold: number;
    }) {
        const primitive = groupKeyPattern.replace('*', '');
        super({
            name: `QueueDepthMonitoring:${primitive}`,
            db,
            tickIntervalMs: envs.ORCHESTRATOR_QUEUE_DEPTH_MONITORING_TICK_INTERVAL_MS,
            abortSignal,
            onError
        });
        this.groupKeyPattern = groupKeyPattern;
        this.primitive = primitive;
        this.threshold = threshold;
    }

    async run(): Promise<void> {
        const topN = envs.ORCHESTRATOR_QUEUE_DEPTH_MONITORING_TOP_N;

        const queueDepth = await tasks.getQueueDepth(this.db, { topN, threshold: this.threshold, groupKeyPattern: this.groupKeyPattern });
        if (queueDepth.isErr()) {
            logger.error(queueDepth.error);
            return;
        }

        for (const { group_key, cnt } of queueDepth.value) {
            metrics.gauge(metrics.Types.ORCH_QUEUE_DEPTH, cnt, { groupKey: group_key, primitive: this.primitive });
        }
    }
}
