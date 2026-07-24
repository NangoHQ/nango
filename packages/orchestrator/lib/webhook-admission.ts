import { metrics } from '@nangohq/utils';

export type WebhookAdmissionRejectionReason = 'concurrency' | 'pool_pressure';

export interface WebhookAdmissionRejection {
    acquired: false;
    reason: WebhookAdmissionRejectionReason;
    retryAfterMs: number;
}

export interface WebhookAdmissionError {
    error: {
        message: string;
        payload: WebhookAdmissionRejection;
    };
}

export interface WebhookAdmissionPermit {
    acquired: true;
    release: () => void;
}

export type WebhookAdmissionResult = WebhookAdmissionPermit | WebhookAdmissionRejection;

export interface WebhookAdmission {
    acquire(): WebhookAdmissionResult;
}

interface WebhookAdmissionOptions {
    maxConcurrency: number;
    dbReserve: number;
    getAvailableConnections: () => number;
    retryAfterMs: number;
}

export class WebhookAdmissionController implements WebhookAdmission {
    private readonly maxConcurrency: number;
    private readonly dbReserve: number;
    private readonly getAvailableConnections: () => number;
    private readonly retryAfterMs: number;
    private active = 0;

    constructor(options: WebhookAdmissionOptions) {
        this.maxConcurrency = options.maxConcurrency;
        this.dbReserve = options.dbReserve;
        this.getAvailableConnections = options.getAvailableConnections;
        this.retryAfterMs = options.retryAfterMs;
    }

    acquire(): WebhookAdmissionResult {
        if (this.active >= this.maxConcurrency) {
            return this.reject('concurrency');
        }
        const effectiveMax = Math.max(1, Math.min(this.maxConcurrency, this.getAvailableConnections() - this.dbReserve));
        // Keep one bounded waiter so sustained core workload cannot starve webhook dispatch entirely.
        if (this.active >= effectiveMax) {
            return this.reject('pool_pressure');
        }

        this.active++;
        metrics.increment(metrics.Types.ORCH_WEBHOOK_ADMISSION, 1, { result: 'accepted' });
        metrics.gauge(metrics.Types.ORCH_WEBHOOK_ADMISSION_INFLIGHT, this.active);
        let released = false;
        return {
            acquired: true,
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                this.active--;
                metrics.gauge(metrics.Types.ORCH_WEBHOOK_ADMISSION_INFLIGHT, this.active);
            }
        };
    }

    private reject(reason: WebhookAdmissionRejectionReason): WebhookAdmissionRejection {
        metrics.increment(metrics.Types.ORCH_WEBHOOK_ADMISSION, 1, { result: 'rejected', reason });
        return { acquired: false, reason, retryAfterMs: this.retryAfterMs };
    }
}
