import { report } from '@nangohq/utils';

import { LogContext, LogContextOrigin, LogContextStateless } from '../client.js';
import { envs } from '../env.js';
import { logger } from '../utils.js';
import { getFormattedOperation } from './helpers.js';
import { createOperation } from './messages.js';
import { BufferTransport } from '../transport.js';

import type { AdditionalOperationData } from './helpers.js';
import type { OperationRow, OperationRowInsert } from '@nangohq/types';

interface Options {
    dryRun?: boolean;
    logToConsole?: boolean;
    start?: boolean;
}

export type LogContextGetter = typeof logContextGetter;

export const logContextGetter = {
    /**
     * Create an operation and return a Context
     */
    async create(data: OperationRowInsert, additionalData: AdditionalOperationData, options?: Options): Promise<LogContextOrigin> {
        const msg = getFormattedOperation(data, additionalData);
        if (typeof options?.start === 'undefined' || options.start) {
            msg.startedAt = msg.startedAt ?? new Date().toISOString();
            msg.state = msg.state === 'waiting' ? 'running' : msg.state;
        }

        try {
            if (envs.NANGO_LOGS_ENABLED && !options?.dryRun) {
                // TODO: remove this after full deploy
                await createOperation(msg);
            } else if (options?.logToConsole !== false) {
                logger.info(`[debug] operation(${JSON.stringify(msg)})`);
            }
        } catch (err) {
            report(new Error('failed_to_create_operation', { cause: err }), { id: msg.id });
        }

        return new LogContextOrigin({ operation: msg }, options);
    },

    /**
     * Return a Context without creating an operation
     */
    async get({ id, accountId }: { id: OperationRow['id']; accountId?: number | undefined }, options?: Options): Promise<LogContext> {
        let createdAt: string | undefined;
        try {
            const split = id.split('_');
            if (split[0]) {
                createdAt = new Date(parseInt(split[0], 10)).toISOString();
            }
        } catch (err) {
            report(new Error('failed_to_parse_id', { cause: err }), { id });
        }
        if (!createdAt) {
            createdAt = new Date().toISOString(); // Fallback to default date
        }
        return Promise.resolve(new LogContext({ id, createdAt, accountId }, { ...options, dryRun: !envs.NANGO_LOGS_ENABLED }));
    },

    getStateLess({ id, accountId }: { id: OperationRow['id']; accountId: OperationRow['accountId'] }, options?: Options): LogContextStateless {
        return new LogContextStateless({ id, accountId }, options);
    },

    getBuffer({ id, accountId }: { id?: OperationRow['id']; accountId: OperationRow['accountId'] }, options?: Options): LogContextStateless {
        return new LogContextStateless({ id: id || '-1', accountId }, { ...options, transport: new BufferTransport() });
    }
};
