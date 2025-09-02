import EventEmitter from 'node:events';

import { GROUP_PREFIX_SEPARATOR, stringifyTask } from '@nangohq/scheduler';
import { metrics, retryWithBackoff } from '@nangohq/utils';

import { envs } from './env.js';
import { logger } from './utils.js';

import type { Task } from '@nangohq/scheduler';
import type knex from 'knex';

class PgEventEmitter extends EventEmitter {
    private knex: knex.Knex;
    private channel: string;
    private client: any = null;
    private connected: boolean = false;
    private shouldReconnect: boolean = true;

    constructor(
        knex: knex.Knex,
        options: {
            channel: string;
        }
    ) {
        super();

        this.knex = knex;
        this.channel = options.channel;
    }

    async connect(): Promise<void> {
        try {
            if (this.connected) {
                return; // Already connected, no need to reconnect
            }

            this.client = await this.knex.client.acquireRawConnection();
            await this.client.query(`LISTEN ${this.channel}`);
            this.connected = true;

            this.client.on('notification', (notification: { pid: number; channel: string; payload?: string }) => {
                if (notification.payload) {
                    super.emit(notification.payload);
                }
            });

            this.client.on('error', (err: Error) => {
                logger.error('PostgreSQL client error:', err);
                this.connected = false;
                super.emit('error', err);
                this.reconnect();
            });

            this.client.on('end', () => {
                logger.info('PostgreSQL connection ended');
                this.connected = false;
                this.reconnect();
            });

            super.emit('connected');
            logger.info(`Successfully listening to channel: ${this.channel}`);
        } catch (err) {
            logger.error('PostgreSQL connection error:', err);
            super.emit('error', err);
            this.reconnect();
        }
    }

    private async reconnect(): Promise<void> {
        if (!this.shouldReconnect) {
            return;
        }
        try {
            await retryWithBackoff(
                () => {
                    return this.connect();
                },
                {
                    startingDelay: 100,
                    timeMultiple: 3,
                    numOfAttempts: 3
                }
            );
        } catch (err) {
            logger.error('Failed to reconnect to PostgreSQL:', err);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                this.shouldReconnect = false;

                this.client.removeAllListeners('notification');
                this.client.removeAllListeners('error');
                this.client.removeAllListeners('end');

                if (this.connected) {
                    try {
                        await this.client.query(`UNLISTEN ${this.channel}`);
                    } catch (_err: unknown) {
                        // Ignore errors during UNLISTEN
                    }
                }

                await this.knex.client.releaseConnection(this.client);

                this.connected = false;
                this.client = null;

                super.emit('disconnected');
                logger.info(`Successfully disconnected from channel: ${this.channel}`);
            } catch (err) {
                logger.error(`Error disconnecting from channel ${this.channel}`, err);
                super.emit('disconnectError', err);
                this.connected = false;
                this.client = null;
            }
        }
    }
    override emit(event: string): boolean {
        if (!this.connected) {
            logger.warning(`Not connected to PostgreSQL, emitting event locally: ${String(event)}`);
            return this.emitLocally(event);
        }

        if (typeof event !== 'string' || !event.trim()) {
            throw new Error('Event name must be a non-empty string');
        }

        this.notify(event).catch((err: unknown) => {
            logger.error('Error notifying PostgreSQL:', err);
            super.emit('notifyError', err, event);
        });
        return true;
    }

    emitLocally(event: string | symbol, ...args: any[]): boolean {
        const hasListeners = this.listenerCount(event) > 0;
        if (hasListeners) {
            return super.emit(event, ...args);
        }
        return false;
    }

    private async notify(payload: string): Promise<void> {
        if (!this.connected || !this.client) {
            throw new Error('Not connected to PostgreSQL');
        }

        // Check payload size (PostgreSQL NOTIFY has ~8KB limit)
        const maxPayloadSize = 8_000;
        if (payload.length > maxPayloadSize) {
            const error = new Error(`Payload too large: ${payload.length} bytes (max: ${maxPayloadSize})`);
            super.emit('payloadTooLarge', error, payload);
            throw error;
        }

        try {
            await this.client.query(`NOTIFY ${this.channel}, '${payload}'`);
        } catch (err: any) {
            if (err.code === 'ECONNRESET' || err.code === 'ENOTCONN') {
                this.connected = false;
                this.reconnect();
            }
            throw err;
        }
    }
}

export const taskEvents = {
    taskCreated: (prop: Task | string): string => {
        if (typeof prop === 'string') {
            return `task:created:${prop}`;
        }
        const groupKeyPrefix = prop.groupKey.split(GROUP_PREFIX_SEPARATOR)[0];
        return `task:created:${groupKeyPrefix}`;
    },
    taskCompleted: (prop: Task | string): string => {
        if (typeof prop === 'string') {
            return `task:completed:${prop}`;
        }
        return `task:completed:${prop.id}`;
    }
};

export class TaskEventsHandler extends PgEventEmitter {
    public readonly onCallbacks: {
        CREATED: (task: Task) => void;
        STARTED: (task: Task) => void;
        SUCCEEDED: (task: Task) => void;
        FAILED: (task: Task) => void;
        EXPIRED: (task: Task) => void;
        CANCELLED: (task: Task) => void;
    };

    private debounced = new Map<string, NodeJS.Timeout>();

    private throttleEmit(event: string, delay: number): void {
        const timeoutId = this.debounced.get(event);

        // If there's no existing timeout, emit the event and set a new timeout
        if (!timeoutId) {
            this.emit(event);

            this.debounced.set(
                event,
                setTimeout(() => {
                    this.debounced.delete(event);
                }, delay)
            );
        }
    }

    constructor(db: knex.Knex) {
        super(db, { channel: 'nango_task_events' });

        this.onCallbacks = {
            CREATED: (task: Task) => {
                logger.info(`Task created: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_CREATED);
                // CREATED events are used for dequeuing tasks per groupKey
                // so we emit them with the groupKey prefix
                // and debounce them to avoid flooding the listeners
                // with too many duplicate events
                this.throttleEmit(taskEvents.taskCreated(task), envs.ORCHESTRATOR_TASK_CREATED_EVENT_DEBOUNCE_MS);
            },
            STARTED: (task: Task) => {
                logger.info(`Task started: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_STARTED);
                // STARTED events are not listen to, so we don't emit them
            },
            SUCCEEDED: (task: Task) => {
                logger.info(`Task succeeded: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_SUCCEEDED);
                this.emit(taskEvents.taskCompleted(task));
            },
            FAILED: (task: Task) => {
                logger.error(`Task failed: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_FAILED);
                this.emit(taskEvents.taskCompleted(task));
            },
            EXPIRED: (task: Task) => {
                logger.error(`Task expired: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_EXPIRED);
                this.emit(taskEvents.taskCompleted(task));
            },
            CANCELLED: (task: Task) => {
                logger.info(`Task cancelled: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_CANCELLED);
                this.emit(taskEvents.taskCompleted(task));
            }
        };
    }
}
