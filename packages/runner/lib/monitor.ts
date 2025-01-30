import os from 'os';
import fs from 'fs';
import { httpFetch, logger } from './utils.js';
import { idle } from './idle.js';
import { envs } from './env.js';
import type { NangoProps } from '@nangohq/types';

const MEMORY_WARNING_PERCENTAGE_THRESHOLD = 75;

export class RunnerMonitor {
    private runnerId: string;
    private tracked: Map<number, NangoProps> = new Map<number, NangoProps>();
    private jobsServiceUrl: string = '';
    private persistServiceUrl: string = '';
    private idleMaxDurationMs = parseInt(process.env['IDLE_MAX_DURATION_MS'] || '') || 0;
    private lastIdleTrackingDate = Date.now();
    private lastMemoryReportDate: Date | null = null;
    private idleInterval: NodeJS.Timeout | null = null;
    private memoryInterval: NodeJS.Timeout | null = null;

    constructor({ runnerId, jobsServiceUrl, persistServiceUrl }: { runnerId: string; jobsServiceUrl: string; persistServiceUrl: string }) {
        this.runnerId = runnerId;
        this.jobsServiceUrl = jobsServiceUrl;
        this.persistServiceUrl = persistServiceUrl;
        if (this.jobsServiceUrl.length > 0) {
            this.memoryInterval = this.checkMemoryUsage();
            this.idleInterval = this.checkIdle();
        }
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
            if (memoryUsagePercentage > MEMORY_WARNING_PERCENTAGE_THRESHOLD) {
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
        for (const { environmentId, activityLogId } of this.tracked.values()) {
            if (!environmentId || !activityLogId) {
                continue;
            }
            await httpFetch({
                method: 'post',
                url: `${this.persistServiceUrl}/environment/${environmentId}/log`,
                data: JSON.stringify({
                    activityLogId: activityLogId,
                    level: 'warn',
                    msg: `Memory usage of nango scripts is high: ${memoryUsagePercentage.toFixed(2)}% of the total available memory.`
                })
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

                    if (envs.RUNNER_NODE_ID) {
                        const res = await idle();
                        if (res.isErr()) {
                            logger.error(`Failed to idle runner`, res.error);
                            nextTimeout = timeoutMs; // Reset to default on error
                        }
                        // Increase the timeout to 2 minutes after a successful idle
                        // to give enough time to fleet to terminate the runner
                        nextTimeout = 120_000;
                    } else {
                        // TODO: DEPRECATE legacy /idle endpoint
                        await httpFetch({
                            method: 'post',
                            url: `${this.jobsServiceUrl}/idle`,
                            data: JSON.stringify({
                                runnerId: this.runnerId,
                                idleTimeMs
                            })
                        });
                    }
                    this.lastIdleTrackingDate = Date.now();
                }
            }
            this.checkIdle(nextTimeout);
        }, timeoutMs);
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
