import { setTimeout } from 'node:timers/promises';

import { stringifyError } from '@nangohq/utils';

import { logger } from './utils.js';

import type { Scheduler } from '@nangohq/scheduler';

export type WebhookAdmissionRejectionReason = 'concurrency' | 'backlog' | 'backlog_unavailable';

export interface WebhookAdmissionRejection {
    acquired: false;
    reason: WebhookAdmissionRejectionReason;
    retryAfterMs: number;
}

export interface WebhookAdmissionPermit {
    acquired: true;
    release: (createdCount: number) => void;
}

export type WebhookAdmissionResult = WebhookAdmissionPermit | WebhookAdmissionRejection;

interface WebhookAdmissionOptions {
    scheduler: Scheduler;
    maxConcurrency: number;
    createdCountMax: number;
    refreshIntervalMs: number;
    retryAfterMs: number;
}

export class WebhookAdmissionController {
    private readonly scheduler: Scheduler;
    private readonly maxConcurrency: number;
    private readonly createdCountMax: number;
    private readonly refreshIntervalMs: number;
    private readonly retryAfterMs: number;
    private readonly abortController = new AbortController();
    private refreshPromise: Promise<void> | null = null;
    private active = 0;
    private createdCount = 0;
    private pendingCreatedCount = 0;
    private backlogAvailable = false;

    constructor(options: WebhookAdmissionOptions) {
        this.scheduler = options.scheduler;
        this.maxConcurrency = options.maxConcurrency;
        this.createdCountMax = options.createdCountMax;
        this.refreshIntervalMs = options.refreshIntervalMs;
        this.retryAfterMs = options.retryAfterMs;
    }

    async start(): Promise<void> {
        if (this.refreshPromise) {
            return;
        }
        await this.refreshBacklog();
        this.refreshPromise = this.refreshLoop();
    }

    async stop(): Promise<void> {
        this.abortController.abort();
        await this.refreshPromise;
        this.refreshPromise = null;
    }

    acquire(requestedCount: number): WebhookAdmissionResult {
        if (!this.backlogAvailable) {
            return this.reject('backlog_unavailable');
        }
        if (this.active >= this.maxConcurrency) {
            return this.reject('concurrency');
        }
        if (this.createdCount + this.pendingCreatedCount + requestedCount > this.createdCountMax) {
            return this.reject('backlog');
        }

        this.active++;
        this.pendingCreatedCount += requestedCount;
        let released = false;
        return {
            acquired: true,
            release: (createdCount: number) => {
                if (released) {
                    return;
                }
                released = true;
                this.active--;
                this.pendingCreatedCount -= requestedCount;
                this.createdCount += createdCount;
            }
        };
    }

    private reject(reason: WebhookAdmissionRejectionReason): WebhookAdmissionRejection {
        return { acquired: false, reason, retryAfterMs: this.retryAfterMs };
    }

    private async refreshLoop(): Promise<void> {
        const signal = this.abortController.signal;
        while (!signal.aborted) {
            try {
                await setTimeout(this.refreshIntervalMs, undefined, { signal });
                await this.refreshBacklog();
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }
                logger.error(`Failed to refresh webhook scheduler backlog: ${stringifyError(err)}`);
            }
        }
    }

    private async refreshBacklog(): Promise<void> {
        const result = await this.scheduler.monitoring.createdCountForGroupPrefix({ groupKeyPrefix: 'webhook:' });
        if (result.isErr()) {
            this.backlogAvailable = false;
            throw result.error;
        }
        this.createdCount = result.value;
        this.backlogAvailable = true;
    }
}
