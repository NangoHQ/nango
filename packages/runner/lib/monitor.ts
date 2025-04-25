import os from 'os';
import fs from 'fs';
import { logger } from './logger.js';
import { idle } from './idle.js';
import { envs } from './env.js';
import { persistClient } from './clients/persist.js';
import type { RunnerWorker } from './workers/worker.js';

export class RunnerMonitor {
    private runnerId: number;
    private workers = new Map<string, RunnerWorker>();
    private idleMaxDurationMs = envs.IDLE_MAX_DURATION_MS;
    private lastIdleTrackingDate = Date.now();
    private lastMemoryReportDate: Date | null = null;
    private idleInterval: NodeJS.Timeout | null = null;
    private memoryInterval: NodeJS.Timeout | null = null;

    constructor({ runnerId }: { runnerId: number }) {
        this.runnerId = runnerId;
        this.memoryInterval = this.checkMemoryUsage();
        this.idleInterval = this.checkIdle();
        process.on('SIGTERM', this.cleanup.bind(this));
    }

    private cleanup(): void {
        if (this.idleInterval) {
            clearInterval(this.idleInterval);
        }
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
        }
        for (const worker of this.workers.values()) {
            worker.abort();
        }
    }

    abort(taskId: string): boolean {
        const worker = this.workers.get(taskId);
        if (worker) {
            worker.abort();
            this.workers.delete(taskId);
            logger.info(`Aborted task ${taskId}`);
            return true;
        } else {
            logger.error(`Error aborting task ${taskId}: task not found`);
            return false;
        }
    }

    track(worker: RunnerWorker): void {
        this.lastIdleTrackingDate = Date.now();
        this.workers.set(worker.taskId, worker);
    }

    untrack(worker: RunnerWorker): void {
        this.workers.delete(worker.taskId);
    }

    resetIdleMaxDurationMs(): void {
        this.idleMaxDurationMs = 1; // 0 is a special value that disables idle tracking
    }

    private checkMemoryUsage(): NodeJS.Timeout {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        return setInterval(async () => {
            const total = getTotalMemoryInBytes();
            const used = Array.from(this.workers.values()).reduce((acc, worker) => {
                return acc + (worker.memoryUsage?.memoryInBytes || 0);
            }, 0);
            const totalUsedMemoryPercentage = (used / total) * 100;
            if (totalUsedMemoryPercentage > envs.RUNNER_MEMORY_WARNING_THRESHOLD) {
                await this.reportHighMemoryUsage({
                    totalMemoryInBytes: total,
                    totalUsedMemoryInBytes: used,
                    totalUsedMemoryPercentage
                });
            }
        }, 1_000);
    }

    private async reportHighMemoryUsage({
        totalMemoryInBytes,
        totalUsedMemoryInBytes,
        totalUsedMemoryPercentage
    }: {
        totalMemoryInBytes: number;
        totalUsedMemoryInBytes: number;
        totalUsedMemoryPercentage: number;
    }): Promise<void> {
        // debounce the memory report to avoid spamming the logs
        if (this.lastMemoryReportDate) {
            const now = new Date();
            const diffInMs = now.getTime() - this.lastMemoryReportDate.getTime();
            if (diffInMs < envs.RUNNER_MEMORY_WARNING_DEBOUNCE_MS) {
                return;
            }
        }
        const count = this.workers.size;
        this.lastMemoryReportDate = new Date();
        for (const worker of this.workers.values()) {
            const { environmentId, activityLogId, secretKey } = worker.nangoProps;
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
                        message: `Memory usage is high: ${totalUsedMemoryPercentage.toFixed(2)}% of the total available memory`,
                        meta: {
                            memoryUsage: {
                                total: formatMemory(totalMemoryInBytes),
                                used: formatMemory(totalUsedMemoryInBytes),
                                thisScript: formatMemory(worker.memoryUsage?.memoryInBytes)
                            },
                            scripts: {
                                concurrent: count
                            }
                        },
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
            if (this.idleMaxDurationMs > 0 && this.workers.size == 0) {
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

function formatMemory(bytes: number | undefined): string {
    if (bytes === undefined) {
        return 'unknown';
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}
