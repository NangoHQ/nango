import EventEmitter from 'node:events';
import { stringifyTask } from '@nangohq/scheduler';
import { metrics, retryWithBackoff } from '@nangohq/utils';
import { validateTask } from './clients/validate.js';
import { envs } from './env.js';
import { GROUP_PREFIX_SEPARATOR } from './scheduler-config.js';
import { logger } from './utils.js';
import type { Task } from '@nangohq/scheduler';
import type knex from 'knex';

function getSafeErrorMessage(output: any): string | null {
    if (!output) return null;
    if (typeof output === 'object' && !Array.isArray(output)) {
        const safeMessage = output.message || output.error_message || output.error;
        if (typeof safeMessage === 'string') {
            return safeMessage.slice(0, 1000);
        }
    }
    return 'Task execution failed';
}

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
                return;
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
                void this.reconnect();
            });

            this.client.on('end', () => {
                logger.info('PostgreSQL connection ended');
                this.connected = false;
                void this.reconnect();
            });

            super.emit('connected');
            logger.info(`Successfully listening to channel: ${this.channel}`);
        } catch (err) {
            logger.error('PostgreSQL connection error:', err);
            super.emit('error', err);
            void this.reconnect();
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
                void this.reconnect();
            }
            throw err;
        }
    }
}

export const taskEvents = {
    taskCreated: (prop: Task | string): string => {
        const groupKey = typeof prop === 'string' ? prop.replaceAll('*', '') : prop.groupKey;
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
        if (res.value.isOnEvent() || res.value.isAction()) {
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
        this.db = db;

        this.onCallbacks = {
            CREATED: (task: Task) => {
                logger.info(`Task created: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_CREATED);
                this.throttleEmit(taskEvents.taskCreated(task), envs.ORCHESTRATOR_TASK_CREATED_EVENT_DEBOUNCE_MS);
            },
            STARTED: (task: Task) => {
                logger.info(`Task started: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_STARTED);
                this.recordExecutionEvent(task, 'STARTED');
            },
            SUCCEEDED: (task: Task) => {
                logger.info(`Task succeeded: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_SUCCEEDED);
                this.recordExecutionEvent(task, 'SUCCESS');
                const event = taskEvents.taskCompleted(task);
                if (event) {
                    this.emit(event);
                }
            },
            FAILED: (task: Task) => {
                logger.error(`Task failed: ${stringifyTask(task)}`);
                metrics.increment(metrics.Types.ORCH_TASKS_FAILED);
                this.recordExecutionEvent(task, 'FAILURE');
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

    private db: knex.Knex;

    private recordExecutionEvent(task: Task, status: 'STARTED' | 'SUCCESS' | 'FAILURE'): void {
        const validated = validateTask(task);
        if (validated.isErr()) return;

        const val = validated.value;
        const type = val.isSync() ? 'SYNC' : val.isAction() ? 'ACTION' : null;
        if (!type || !('connection' in val)) return;

        const connection = val.connection;
        if (!connection) return;

        let duration_ms: number | undefined = undefined;
        if (status === 'SUCCESS' || status === 'FAILURE') {
            const start = task.createdAt;
            const end = task.lastStateTransitionAt;
            duration_ms = Math.max(0, end.getTime() - start.getTime());
        }

        let integration_id = connection.provider_config_key;
        if (val.isSync()) {
            integration_id = val.syncName;
        } else if (val.isAction()) {
            integration_id = val.actionName;
        }

        let error_message: string | null = null;
        if (status === 'FAILURE') {
            error_message = getSafeErrorMessage(task.output);
        }

        const event = {
            environment_id: connection.environment_id,
            integration_id: integration_id,
            connection_id: connection.connection_id,
            provider: connection.provider_config_key,
            type,
            status,
            retries: task.retryCount,
            duration_ms,
            error_type: status === 'FAILURE' ? 'UNKNOWN' : null,
            error_message
        };

        void retryWithBackoff(
            () => this.db.from('execution_events').insert(event),
            {
                startingDelay: 100,
                timeMultiple: 3,
                numOfAttempts: 3
            }
        ).catch((err: unknown) => {
            logger.error('Failed to insert execution event after retries:', err);
            metrics.increment(metrics.Types.ORCH_EXECUTION_EVENTS_DROPPED);
        });
    }
}