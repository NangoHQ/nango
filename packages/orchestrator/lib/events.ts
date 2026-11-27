import EventEmitter from 'node:events';

import { stringifyTask } from '@nangohq/scheduler';
import { metrics, retryWithBackoff } from '@nangohq/utils';

import { validateTask } from './clients/validate.js';
import { envs } from './env.js';
import { GROUP_PREFIX_SEPARATOR } from './scheduler-config.js';
import { logger } from './utils.js';

import type { OrchestratorTask } from './clients/types.js';
import type { Task } from '@nangohq/scheduler';
import type knex from 'knex';

class PgEventEmitter extends EventEmitter {
    private knex: knex.Knex;
    private channel: string;
    private client: any = null;
    private connected: boolean = false;
    private shouldReconnect: boolean = true;
    private reconnecting: Promise<void> | null = null;

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

    /**
     * Opens the dedicated LISTEN connection. Rejects when it can't connect.
     * Once connected, a lost connection is re-opened in the background until disconnect() is called.
     */
    async connect(): Promise<void> {
        if (this.connected) {
            return; // Already connected, no need to reconnect
        }
        this.shouldReconnect = true;
        try {
            await this.listen();
        } catch (err) {
            logger.error('PostgreSQL connection error:', err);
            this.emitError(err);
            throw err;
        }
    }

    private async listen(): Promise<void> {
        const client = await this.knex.client.acquireRawConnection();

        // Attach the handlers before the first query, so an error during LISTEN is never unhandled
        client.on('notification', (notification: { pid: number; channel: string; payload?: string }) => {
            if (notification.payload) {
                super.emit(notification.payload);
            }
        });
        client.on('error', (err: Error) => {
            this.onConnectionLost(client, err);
        });
        client.on('end', () => {
            this.onConnectionLost(client);
        });

        try {
            await client.query(`LISTEN ${this.channel}`);
        } catch (err) {
            this.discard(client);
            throw err;
        }

        if (!this.shouldReconnect) {
            // disconnect() was called while we were connecting
            this.discard(client);
            return;
        }

        this.client = client;
        this.connected = true;
        super.emit('connected');
        logger.info(`Successfully listening to channel: ${this.channel}`);
    }

    private onConnectionLost(client: any, err?: Error): void {
        if (client !== this.client) {
            // A client we already replaced or discarded: pg emits both 'error' and 'end' for one lost connection
            return;
        }

        if (err) {
            logger.error('PostgreSQL client error:', err);
        } else {
            logger.info('PostgreSQL connection ended');
        }

        this.connected = false;
        this.client = null;
        this.discard(client);
        if (err) {
            this.emitError(err);
        }
        void this.reconnect();
    }

    private discard(client: any): void {
        client.removeAllListeners('notification');
        client.removeAllListeners('error');
        client.removeAllListeners('end');
        // pg turns an 'error' with no listener into an uncaught exception, so keep a no-op one on the dead client
        client.on('error', () => {});
        this.knex.client.destroyRawConnection(client).catch(() => {});
    }

    /**
     * EventEmitter throws when 'error' is emitted with no listener.
     * Inside a pg event handler that throw used to skip the reconnect, leaving the orchestrator
     * running without LISTEN (it only emitted events locally) until it was restarted.
     */
    private emitError(err: unknown): void {
        if (this.listenerCount('error') > 0) {
            super.emit('error', err);
        }
    }

    private reconnect(): Promise<void> {
        if (!this.shouldReconnect) {
            return Promise.resolve();
        }
        if (this.reconnecting) {
            return this.reconnecting;
        }

        // Keep trying until it works or disconnect() is called: giving up leaves this process deaf to other orchestrators
        const reconnecting = (async () => {
            try {
                await retryWithBackoff(
                    async () => {
                        if (!this.shouldReconnect || this.connected) {
                            return;
                        }
                        await this.listen();
                    },
                    {
                        startingDelay: 100,
                        timeMultiple: 2,
                        maxDelay: 10_000,
                        numOfAttempts: Infinity,
                        retry: (err: unknown, attemptNumber: number) => {
                            logger.error(`Failed to reconnect to PostgreSQL (attempt ${attemptNumber}):`, err);
                            return this.shouldReconnect;
                        }
                    }
                );
            } catch (err) {
                logger.error('Failed to reconnect to PostgreSQL:', err);
            } finally {
                this.reconnecting = null;
            }
        })();
        this.reconnecting = reconnecting;
        return reconnecting;
    }

    async disconnect(): Promise<void> {
        this.shouldReconnect = false;
        if (this.client) {
            try {
                this.client.removeAllListeners('notification');
                this.client.removeAllListeners('error');
                this.client.removeAllListeners('end');
                // pg turns an 'error' with no listener into an uncaught exception
                this.client.on('error', () => {});

                if (this.connected) {
                    try {
                        await this.client.query(`UNLISTEN ${this.channel}`);
                    } catch (_err: unknown) {
                        // Ignore errors during UNLISTEN
                    }
                }

                // A raw connection is not from the pool: releasing it would leave it open
                await this.knex.client.destroyRawConnection(this.client);

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

        const client = this.client;
        try {
            await client.query('SELECT pg_notify($1, $2)', [this.channel, payload]);
        } catch (err: any) {
            if (err.code === 'ECONNRESET' || err.code === 'ENOTCONN') {
                this.onConnectionLost(client, err);
            }
            throw err;
        }
    }
}

export const taskEvents = {
    taskCreated: (prop: Task | string): string => {
        const groupKey = typeof prop === 'string' ? prop.replaceAll('*', '') : prop.groupKey;
        // If the groupKey contains the separator, we only take the prefix part
        // so that listeners can listen to a group of tasks
        const groupKeyPrefix = groupKey.split(GROUP_PREFIX_SEPARATOR)[0];
        return `task:created:${groupKeyPrefix}`;
    },
    taskCompleted: (prop: Task | string): string | undefined => {
        if (typeof prop === 'string') {
            return `task:completed:${prop}`;
        }

        const res = validateTask(prop);
        if (res.isErr()) {
            return undefined;
        }

        if (shouldListenForCompletion(res.value)) {
            return `task:completed:${prop.id}`;
        }
        return undefined;
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
                const event = taskEvents.taskCompleted(task);
                if (event) {
                    this.emit(event);
                }
            },
            FAILED: (task: Task) => {
                logger.error(`Task failed: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_FAILED);
                const event = taskEvents.taskCompleted(task);
                if (event) {
                    this.emit(event);
                }
            },
            EXPIRED: (task: Task) => {
                logger.error(`Task expired: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_EXPIRED);
                const event = taskEvents.taskCompleted(task);
                if (event) {
                    this.emit(event);
                }
            },
            CANCELLED: (task: Task) => {
                logger.info(`Task cancelled: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_CANCELLED);
                const event = taskEvents.taskCompleted(task);
                if (event) {
                    this.emit(event);
                }
            }
        };
    }
}

function shouldListenForCompletion(t: OrchestratorTask): boolean {
    // synchronous action and function tasks are being listened to for completion
    if (t.isFunction() || t.isAction()) {
        return !t.async;
    }
    // onEvent tasks are also being listened to for completion
    if (t.isOnEvent()) {
        return true;
    }
    return false;
}
