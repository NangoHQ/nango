import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import { getLogger } from '@nangohq/utils';
import type { ExecOpts } from './exec.js';
import { exec } from './exec.js';
import { JobsClient } from '../clients/jobs.js';
import type { NangoProps } from '@nangohq/types';
import { Locks } from '../sdk/locks.js';

type WorkerInMessage = 'start' | 'abort';
interface WorkerOutMessage {
    memoryInBytes: number;
}

export type WorkerProps = {
    taskId: string;
    jobsServiceUrl: string;
    heartbeatIntervalMs: number;
    memoryCheckIntervalMs: number;
    locksBuffer: SharedArrayBuffer;
} & Omit<ExecOpts, 'abortController' | 'locks'>;

export class RunnerWorker {
    public taskId: string;
    public nangoProps: NangoProps;
    public memoryUsage: { memoryInBytes: number; measuredAt: Date } | null;

    private worker: Worker | null = null;

    constructor(props: WorkerProps) {
        if (isMainThread) {
            this.taskId = props.taskId;
            this.nangoProps = props.nangoProps;
            this.memoryUsage = null;

            const url = new URL('../../dist/workers/worker.boot.js', import.meta.url);
            if (!fs.existsSync(url)) {
                throw new Error(`RunnerWorker script not found at ${url.href}`);
            }
            this.worker = new Worker(url, { workerData: props });
            this.worker.on('message', (msg: WorkerOutMessage) => {
                if (msg.memoryInBytes) {
                    this.memoryUsage = { memoryInBytes: msg.memoryInBytes, measuredAt: new Date() };
                }
            });
        } else {
            throw new Error('RunnerWorker should be instantiated in the main thread');
        }
    }

    start(): void {
        this.post('start');
    }

    abort(): void {
        this.post('abort');
    }

    on(event: 'error', callback: (err: Error) => void): void;
    on(event: 'exit', callback: (exitCode: number) => void): void;
    on(event: 'error' | 'exit', callback: (arg: any) => void): void {
        this.worker?.on(event, callback);
    }

    private post(message: WorkerInMessage): void {
        this.worker?.postMessage(message);
    }
}

export class RunnerChild {
    private logger: ReturnType<typeof getLogger>;
    private parent: MessagePort;
    private jobsClient: JobsClient;
    private heartbeatIntervalMs: number;
    private memoryCheckIntervalMs: number;
    private abortController: AbortController;
    private taskId: string;
    private execOpts: ExecOpts;

    constructor({ parent, props }: { parent: MessagePort; props: WorkerProps }) {
        if (isMainThread) {
            throw new Error('RunnerChild should not be instantiated in the main thread');
        }
        this.jobsClient = new JobsClient({ baseUrl: props.jobsServiceUrl });
        this.taskId = props.taskId;
        this.heartbeatIntervalMs = props.heartbeatIntervalMs;
        this.memoryCheckIntervalMs = props.memoryCheckIntervalMs;
        this.abortController = new AbortController();
        this.execOpts = {
            nangoProps: props.nangoProps,
            code: props.code,
            codeParams: props.codeParams,
            abortController: this.abortController,
            locks: Locks.fromBuffer(props.locksBuffer)
        };
        this.logger = getLogger(`Worker-${this.taskId}`);

        this.parent = parent;
        this.parent.on('message', async (msg: WorkerInMessage) => {
            switch (msg) {
                case 'start':
                    await this.start();
                    break;
                case 'abort':
                    this.abort();
                    break;
            }
        });
    }

    async run(): Promise<void> {
        const heartbeat = setInterval(async () => {
            try {
                await this.jobsClient.postHeartbeat({ taskId: this.taskId });
            } catch (err) {
                this.logger.error('Heartbeat failed', { err });
            }
        }, this.heartbeatIntervalMs);

        const memoryUsage = setInterval(() => {
            this.reportMemory(process.memoryUsage().heapUsed + process.memoryUsage().external);
        }, this.memoryCheckIntervalMs);

        try {
            const { error, response: output } = await exec(this.execOpts);
            await this.jobsClient.putTask({
                taskId: this.taskId,
                nangoProps: this.execOpts.nangoProps,
                ...(error ? { error } : { output: output as any })
            });
            this.logger.info(`Completed task: ${this.taskId}`);
        } finally {
            clearInterval(heartbeat);
            clearInterval(memoryUsage);
            process.exit(0);
        }
    }

    private reportMemory(memoryInBytes: number): void {
        this.parent.postMessage({ memoryInBytes });
    }

    private async start(): Promise<void> {
        this.logger.info(`Starting task: ${this.taskId}`);
        return this.run();
    }

    private abort(): void {
        this.logger.info(`Aborting task`, { taskId: this.taskId });
        this.abortController.abort();
    }
}
