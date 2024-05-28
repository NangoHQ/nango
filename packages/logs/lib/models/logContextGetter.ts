import { nanoid, stringifyError } from '@nangohq/utils';
import type { SetRequired } from 'type-fest';
import { createMessage, getOperation } from './messages.js';
import { envs } from '../env.js';
import type { FormatMessageData } from './helpers.js';
import { getFormattedMessage } from './helpers.js';
import { LogContext, LogContextStateless } from '../client.js';
import { logger } from '../utils.js';
import type { MessageRow, OperationRow, OperationRowInsert } from '@nangohq/types';

interface Options {
    dryRun?: boolean;
    logToConsole?: boolean;
}

export interface OperationContextData extends FormatMessageData {
    start?: boolean;
}

export type LogContextGetter = typeof logContextGetter;

export const logContextGetter = {
    /**
     * Create an operation and return a Context
     */
    async create(
        data: OperationRowInsert,
        { start, ...rest }: SetRequired<OperationContextData, 'account' | 'environment'>,
        options?: Options
    ): Promise<LogContext> {
        const msg = getFormattedMessage(data, rest);
        if (typeof start === 'undefined' || start) {
            msg.startedAt = msg.startedAt ?? new Date().toISOString();
            msg.state = msg.state === 'waiting' ? 'running' : msg.state;
        }

        try {
            if (envs.NANGO_LOGS_ENABLED && !options?.dryRun) {
                await createMessage(msg);
            } else if (options?.logToConsole !== false) {
                logger.info(`[debug] operation(${JSON.stringify(msg)})`);
            }
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_create_operation ${stringifyError(err)}`);
        }

        return new LogContext({ parentId: msg.id, operation: msg }, options);
    },

    /**
     * Return a Context without creating an operation
     */
    async get({ id }: { id: MessageRow['id'] }, options?: Options): Promise<LogContext> {
        try {
            if (envs.NANGO_LOGS_ENABLED) {
                const operation = await getOperation({ id });
                return new LogContext({ parentId: id, operation }, options);
            }
        } catch (err) {
            // TODO: reup throw
            logger.error(`failed_to_get_operation ${stringifyError(err)}`);
        }

        // If it failed, we create a fake operation for now
        return new LogContext({ parentId: id, operation: { id: nanoid(), createdAt: new Date().toISOString() } as OperationRow }, { ...options, dryRun: true });
    },

    getStateLess({ id }: { id: MessageRow['id'] }, options?: Options): LogContextStateless {
        return new LogContextStateless({ parentId: id }, options);
    }
};
