import { metrics } from '@nangohq/utils';

export type WebhookAdmissionRejectionReason = 'concurrency';

export interface WebhookAdmissionRejection {
    acquired: false;
    reason: WebhookAdmissionRejectionReason;
    retryAfterMs: number;
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
    retryAfterMs: number;
}

export class WebhookAdmissionController implements WebhookAdmission {
    private readonly maxConcurrency: number;
    private readonly retryAfterMs: number;
    private active = 0;

    constructor(options: WebhookAdmissionOptions) {
        this.maxConcurrency = options.maxConcurrency;
        this.retryAfterMs = options.retryAfterMs;
    }

    acquire(): WebhookAdmissionResult {
        if (this.active >= this.maxConcurrency) {
            return this.reject('concurrency');
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
