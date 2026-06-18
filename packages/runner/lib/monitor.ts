import fs from 'fs';
import os from 'os';

import { metrics } from '@nangohq/utils';

import { PersistClient } from './clients/persist.js';
import { envs } from './env.js';
import { idle } from './idle.js';
import { logger } from './logger.js';

import type { NangoProps } from '@nangohq/types';

const regexRunnerUrl = /^http:\/\/(production|staging)-runner-account-(\d+|default)-\d+/;

interface TrackedTask {
    nangoProps: NangoProps;
    persistClient?: PersistClient;
}

interface LocalConflictEntry {
    timestamp: number;
    ttlMs: number;
}

export class RunnerMonitor {
    private runnerId: number;
    private tracked = new Map<string, TrackedTask>();
    private localConflicts = new Map<string, LocalConflictEntry>();
    private idleMaxDurationMs = envs.IDLE_MAX_DURATION_MS;
    private lastIdleTrackingDate = Date.now();
    private lastMemoryReportDate: Date | null = null;
    private idleInterval: NodeJS.Timeout | null = null;
    private memoryInterval: NodeJS.Timeout | null = null;
    private runnerAccountId: string | null = null;

    constructor({ runnerId }: { runnerId: number }) {
        this.runnerId = runnerId;
        this.memoryInterval = this.checkMemoryUsage();
        this.idleInterval = this.checkIdle();
        process.on('SIGTERM', this.onExit.bind(this));
        this.runnerAccountId = envs.RUNNER_URL ? (regexRunnerUrl.exec(envs.RUNNER_URL)?.[2] ?? null) : null;
    }

    private onExit(): void {
        if (this.idleInterval) {
            clearInterval(this.idleInterval);
        }
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
        }
    }

    private conflictKey(environmentId: number, scriptType: string, syncId: string): string {
        return `function:${environmentId}:${scriptType}:${syncId}`;
    }

    private conflictTtlMs(): number {
        return envs.RUNNER_HEARTBEAT_INTERVAL_MS * envs.RUNNER_SYNC_CONFLICT_HEARTBEAT_INTERVAL_MULTIPLIER;
    }

    private isLocalConflictExpired(entry: LocalConflictEntry): boolean {
        return entry.ttlMs > 0 && Date.now() - entry.timestamp > entry.ttlMs;
    }

    private acquireLocalConflict(nangoProps: NangoProps, refresh: boolean): void {
        const key = this.conflictKey(nangoProps.environmentId, nangoProps.scriptType, nangoProps.syncId!);
        const existing = this.localConflicts.get(key);
        const isExpired = existing !== undefined && this.isLocalConflictExpired(existing);
        if (isExpired || refresh || existing === undefined) {
            this.localConflicts.set(key, { timestamp: Date.now(), ttlMs: this.conflictTtlMs() });
            return;
        }
        throw new Error('Conflicting sync detected');
    }

    private releaseLocalConflict(nangoProps: NangoProps): void {
        const key = this.conflictKey(nangoProps.environmentId, nangoProps.scriptType, nangoProps.syncId!);
        this.localConflicts.delete(key);
    }

    private getMemoryPersistClient(entry: TrackedTask): PersistClient {
        return entry.persistClient ?? new PersistClient({ secretKey: entry.nangoProps.secretKey });
    }

    async trackForConflicts(taskId: string, opts = { refresh: false }): Promise<void> {
        const entry = this.tracked.get(taskId);
        if (!entry) {
            return;
        }
        const { nangoProps, persistClient } = entry;
        if (nangoProps.scriptType !== 'sync' || !nangoProps.syncId) {
            return;
        }

        if (persistClient) {
            const res = await persistClient.putSyncConflict({
                environmentId: nangoProps.environmentId,
                scriptType: nangoProps.scriptType,
                syncId: nangoProps.syncId,
                refresh: opts.refresh
            });
            if (res.isErr()) {
                logger.error('Failed to track sync for conflicts', { error: res.error });
                if (res.error.message === 'Conflicting sync detected') {
                    throw new Error('Conflicting sync detected');
                }
                throw res.error;
            }
            return;
        }

        this.acquireLocalConflict(nangoProps, opts.refresh);
    }

    async track(nangoProps: NangoProps, taskId: string, opts?: { persistClient?: PersistClient }): Promise<void> {
        this.tracked.set(taskId, {
            nangoProps,
            ...(opts?.persistClient ? { persistClient: opts.persistClient } : {})
        });
        await this.trackForConflicts(taskId);
        this.lastIdleTrackingDate = Date.now();
    }

    async untrack(taskId: string): Promise<void> {
        const entry = this.tracked.get(taskId);
        if (entry && entry.nangoProps.scriptType === 'sync' && entry.nangoProps.syncId) {
            if (entry.persistClient) {
                const res = await entry.persistClient.deleteSyncConflict({
                    environmentId: entry.nangoProps.environmentId,
                    scriptType: entry.nangoProps.scriptType,
                    syncId: entry.nangoProps.syncId
                });
                if (res.isErr()) {
                    logger.error('Failed to untrack sync', { error: res.error });
                }
            } else {
                this.releaseLocalConflict(entry.nangoProps);
            }
        }
        this.tracked.delete(taskId);
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
            if (this.runnerAccountId) {
                metrics.gauge(metrics.Types.RUNNER_MEMORY_USAGE, memoryUsagePercentage, { accountId: this.runnerAccountId });
            }
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
        for (const entry of this.tracked.values()) {
            const { nangoProps } = entry;
            if (!nangoProps.environmentId || !nangoProps.activityLogId) {
                continue;
            }
            await this.getMemoryPersistClient(entry).postLog({
                environmentId: nangoProps.environmentId,
                data: JSON.stringify({
                    activityLogId: nangoProps.activityLogId,
                    log: {
                        type: 'log',
                        level: 'warn',
                        message: `Memory usage is high: ${memoryUsagePercentage.toFixed(2)}% of the total available memory.`,
                        createdAt: new Date().toISOString()
                    }
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

// TODO: revisit memory monitoring since runners are not running in Render anymore
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
