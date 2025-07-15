import fs from 'fs';
import os from 'os';

import { persistClient } from './clients/persist.js';
import { envs } from './env.js';
import { idle } from './idle.js';
import { logger } from './logger.js';

import type { NangoProps } from '@nangohq/types';

export class RunnerMonitor {
    private runnerId: number;
    private tracked: Map<number, NangoProps> = new Map<number, NangoProps>();
    private idleMaxDurationMs = envs.IDLE_MAX_DURATION_MS;
    private lastIdleTrackingDate = Date.now();
    private lastMemoryReportDate: Date | null = null;
    private idleInterval: NodeJS.Timeout | null = null;
    private memoryInterval: NodeJS.Timeout | null = null;

    constructor({ runnerId }: { runnerId: number }) {
        this.runnerId = runnerId;
        this.memoryInterval = this.checkMemoryUsage();
        this.idleInterval = this.checkIdle();
        process.on('SIGTERM', this.onExit.bind(this));
    }

    private onExit(): void {
        if (this.idleInterval) {
            clearInterval(this.idleInterval);
        }
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
        }
    }

    track(nangoProps: NangoProps): void {
        if (nangoProps.syncJobId) {
            this.lastIdleTrackingDate = Date.now();
            this.tracked.set(nangoProps.syncJobId, nangoProps);
        }
    }

    untrack(nangoProps: NangoProps): void {
        if (nangoProps.syncJobId) {
            this.tracked.delete(nangoProps.syncJobId);
        }
    }

    resetIdleMaxDurationMs(): void {
        this.idleMaxDurationMs = 1; // 0 is a special value that disables idle tracking
    }

    private checkMemoryUsage(): NodeJS.Timeout {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        return setInterval(async () => {
            const rss = process.memoryUsage().rss;
            const total = getTotalMemoryInBytes();
            const memoryUsagePercentage = (rss / total) * 100;
            if (memoryUsagePercentage > envs.RUNNER_MEMORY_WARNING_THRESHOLD) {
                await this.reportHighMemoryUsage(memoryUsagePercentage);
            }
        }, 1000);
    }

    private async reportHighMemoryUsage(memoryUsagePercentage: number): Promise<void> {
        // only report if it has been more than 30 seconds since the last report
        if (this.lastMemoryReportDate) {
            const now = new Date();
            const diffInSecs = (now.getTime() - this.lastMemoryReportDate.getTime()) / 1000;
            if (diffInSecs < 30) {
                return;
            }
        }
        this.lastMemoryReportDate = new Date();
        for (const { environmentId, activityLogId, secretKey } of this.tracked.values()) {
            if (!environmentId || !activityLogId) {
                continue;
            }
            await persistClient.postLog({
                secretKey,
                environmentId,
                data: {
                    activityLogId: activityLogId,
                    log: {
                        type: 'log',
                        level: 'warn',
                        message: `Memory usage is high: ${memoryUsagePercentage.toFixed(2)}% of the total available memory.`,
                        createdAt: new Date().toISOString()
                    }
                }
            });
        }
    }

    private checkIdle(timeoutMs: number = 10000): NodeJS.Timeout | null {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        return setTimeout(async () => {
            let nextTimeout = timeoutMs;
            if (this.idleMaxDurationMs > 0 && this.tracked.size == 0) {
                const idleTimeMs = Date.now() - this.lastIdleTrackingDate;
                if (idleTimeMs > this.idleMaxDurationMs) {
                    logger.info(`Runner '${this.runnerId}' idle for more than ${this.idleMaxDurationMs}ms`);
                    const res = await idle();
                    if (res.isErr()) {
                        logger.error(`Failed to idle runner`, res.error);
                        nextTimeout = timeoutMs; // Reset to default on error
                    }
                    // Increase the timeout to 2 minutes after a successful idle
                    // to give enough time to fleet to terminate the runner
                    nextTimeout = 120_000;
                    this.lastIdleTrackingDate = Date.now();
                }
            }
            this.checkIdle(nextTimeout);
        }, timeoutMs);
    }

    hasConflictingSync(newTask: NangoProps): boolean {
        if (newTask.scriptType !== 'sync') {
            return false;
        }

        for (const task of this.tracked.values()) {
            // Should cover sync and sync variant
            // Webhooks have the same syncId so we allow them to run in parallel
            if (task.syncId === newTask.syncId && task.scriptType === 'sync') {
                return true;
            }
        }
        return false;
    }
}

function getRenderTotalMemoryInBytes(): number {
    const memoryMaxFile = '/sys/fs/cgroup/memory.max';
    try {
        const output = fs.readFileSync(memoryMaxFile, 'utf-8');
        const memoryLimitInBytes = parseInt(output.trim(), 10);
        return memoryLimitInBytes;
    } catch {
        return 0;
    }
}

function getTotalMemoryInBytes(): number {
    // when running inside a container, os.totalmem() returns the total memory of the system, not the memory limit of the container
    // see: https://github.com/nodejs/node/issues/51095
    // process.constrainedMemory() is supposed to return the memory limit of the container but it doesn't work on Render
    // so we need to use a workaround to get the memory limit of the container on Render
    return process.constrainedMemory() || getRenderTotalMemoryInBytes() || os.totalmem();
}
