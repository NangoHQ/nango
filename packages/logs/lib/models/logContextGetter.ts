import { report } from '@nangohq/utils';
import { createOperation } from './messages.js';
import { envs } from '../env.js';
import type { AdditionalOperationData } from './helpers.js';
import { getFormattedOperation } from './helpers.js';
import { LogContext, LogContextOrigin, LogContextStateless } from '../client.js';
import { logger } from '../utils.js';
import type { OperationRow, OperationRowInsert } from '@nangohq/types';
import { getKVStore } from '@nangohq/kvstore';

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
                const res = await createOperation(msg);
                const store = await getKVStore();
                await store.set(`es:operation:${msg.id}:indexName`, res.index, { ttlInMs: 5 * 60 * 1000 });
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
        const split = id.split('_');
        const createdAt = split[0] ? new Date(parseInt(split[0], 10)).toISOString() : new Date().toISOString(); // Fallback to default date
        return Promise.resolve(new LogContext({ id, createdAt, accountId }, { ...options, dryRun: !envs.NANGO_LOGS_ENABLED }));
    },

    getStateLess({ id, accountId }: { id: OperationRow['id']; accountId: OperationRow['accountId'] }, options?: Options): LogContextStateless {
        return new LogContextStateless({ id, accountId }, options);
    }
};
