import type { Result } from '@nangohq/utils';
import { Err, stringifyError, getLogger } from '@nangohq/utils';
import type { OrchestratorClient } from './client.js';
import type { OrchestratorTask } from './types.js';
import type { JsonValue } from 'type-fest';

const logger = getLogger('orchestrator.clients.processor');

export class OrchestratorProcessor {
    private handler: (task: OrchestratorTask) => Promise<Result<JsonValue>>;
    private groupKey: string;
    private orchestratorClient: OrchestratorClient;
    private queue: Queue;
    private stopped: boolean;
    private abortControllers: Map<string, AbortController>;
    private terminatedTimer: NodeJS.Timeout | null = null;
    private checkForTerminatedInterval: number;

    constructor({
        handler,
        opts
    }: {
        handler: (task: OrchestratorTask) => Promise<Result<JsonValue>>;
        opts: { orchestratorClient: OrchestratorClient; groupKey: string; maxConcurrency: number; checkForTerminatedInterval?: number };
    }) {
        this.stopped = true;
        this.handler = handler;
        this.groupKey = opts.groupKey;
        this.orchestratorClient = opts.orchestratorClient;
        this.queue = new Queue(opts.maxConcurrency);
        this.abortControllers = new Map();
        this.checkForTerminatedInterval = opts.checkForTerminatedInterval || 1000;
    }

    public start() {
        this.stopped = false;
        this.terminatedTimer = setInterval(async () => {
            await this.checkForTerminatedTasks();
        }, this.checkForTerminatedInterval); // checking for cancelled/expired doesn't require to be very responsive so we can do it on an interval
        void this.processingLoop();
    }

    public stop() {
        this.stopped = true;
        if (this.terminatedTimer) {
            clearInterval(this.terminatedTimer);
        }
    }

    private async checkForTerminatedTasks() {
        if (this.stopped || this.abortControllers.size <= 0) {
            return;
        }
        const ids = Array.from(this.abortControllers.keys());
        const search = await this.orchestratorClient.search({ ids });
        if (search.isErr()) {
            return Err(search.error);
        }
        for (const task of search.value) {
            // if task is already in a terminal state, invoke the abort signal
            if (['FAILED', 'EXPIRED', 'CANCELLED', 'SUCCEEDED'].includes(task.state)) {
                const abortController = this.abortControllers.get(task.id);
                if (abortController) {
                    abortController.abort();
                    this.abortControllers.delete(task.id);
                }
            }
        }
        return;
    }

    private async processingLoop() {
        while (!this.stopped) {
            if (this.queue.available() > 0) {
                const tasks = await this.orchestratorClient.dequeue({ groupKey: this.groupKey, limit: this.queue.available() * 2, waitForCompletion: true }); // fetch more than available to keep the queue full
                if (tasks.isErr()) {
                    logger.error(`failed to dequeue tasks: ${stringifyError(tasks.error)}`);
                    continue;
                }
                for (const task of tasks.value) {
                    await this.processTask(task);
                }
            }
        }
        return;
    }

    private async processTask(task: OrchestratorTask): Promise<void> {
        this.abortControllers.set(task.id, task.abortController);
        this.queue.run(async () => {
            try {
                const res = await this.handler(task);
                if (res.isErr()) {
                    this.orchestratorClient.failed({ taskId: task.id, error: res.error });
                } else {
                    this.orchestratorClient.succeed({ taskId: task.id, output: res.value });
                }
                this.abortControllers.delete(task.id);
            } catch (err) {
                logger.error(`process uncaught error: ${stringifyError(err)}`);
            }
        });
    }
}

class Queue {
    private maxConcurrency: number;
    private queue: (() => void)[];

    constructor(maxConcurrency: number) {
        this.maxConcurrency = maxConcurrency;
        this.queue = [];
    }

    private async acquire(): Promise<void> {
        if (this.queue.length < this.maxConcurrency) {
            return;
        }
        await new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    private release(): void {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) {
                next();
            }
        }
    }

    public async run<T>(f: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await f();
        } finally {
            this.release();
        }
    }

    public available(): number {
        return this.maxConcurrency - this.queue.length;
    }
}
