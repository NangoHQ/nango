export class CircuitBreaker {
    private state: 'healthy' | 'unhealthy';
    private healthCheckIntervalMs: number;
    private failureThreshold: number;
    private recoveryThreshold: number;
    private healthCheck: () => Promise<boolean>;
    private counter: number;
    private timer: NodeJS.Timeout | null = null;

    constructor(props: { healthCheckIntervalMs: number; failureThreshold: number; recoveryThreshold: number; healthCheck: () => Promise<boolean> }) {
        this.state = 'healthy';
        this.counter = 0;
        this.healthCheckIntervalMs = props.healthCheckIntervalMs;
        this.failureThreshold = props.failureThreshold;
        this.recoveryThreshold = props.recoveryThreshold;
        this.healthCheck = props.healthCheck;
        if (this.healthCheckIntervalMs > 0) {
            this.scheduleNext();
        }
    }

    private scheduleNext(): void {
        this.timer = setTimeout(async () => {
            await this.run();
            this.scheduleNext();
        }, this.healthCheckIntervalMs);
    }

    async run(): Promise<void> {
        let isHealthy: boolean;
        try {
            isHealthy = await this.healthCheck();
        } catch {
            isHealthy = false;
        }
        if (this.state === 'unhealthy') {
            if (isHealthy) {
                this.counter++;
                if (this.counter >= this.recoveryThreshold) {
                    this.state = 'healthy';
                    this.counter = 0;
                }
            } else {
                this.counter = 0; // reset counter if still unhealthy
            }
        } else {
            if (!isHealthy) {
                this.counter++;
                if (this.counter >= this.failureThreshold) {
                    this.state = 'unhealthy';
                    this.counter = 0;
                }
            } else {
                this.counter = 0; // reset counter if healthy
            }
        }
    }

    isUnhealthy(): boolean {
        return this.state === 'unhealthy';
    }

    destroy() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
