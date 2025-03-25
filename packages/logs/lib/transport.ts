import { metrics, report } from '@nangohq/utils';

import { errorToDocument } from './formatters.js';
import { getFormattedMessage } from './models/helpers.js';
import { createMessage } from './models/messages.js';
import { logLevelToLogger, logger } from './utils.js';

import type { LogContextStateless } from './client.js';
import type { MaybePromise, MessageRowInsert } from '@nangohq/types';

interface Props {
    operationId: string;
    accountId?: number | undefined;
    dryRun: boolean;
    logToConsole: boolean;
}

export abstract class LogTransportAbstract {
    abstract log(msg: MessageRowInsert, { accountId, dryRun, logToConsole }: Props): MaybePromise<boolean>;
    abstract merge(source: LogContextStateless, destination: LogContextStateless): MaybePromise<void>;
}

export class ESTransport implements LogTransportAbstract {
    async log(data: MessageRowInsert, { operationId, accountId, dryRun, logToConsole }: Props): Promise<boolean> {
        if (data.error && data.error.constructor.name !== 'Object') {
            data.error = errorToDocument(data.error);
        }

        if (logToConsole) {
            const obj: Record<string, any> = {};
            if (data.error) obj['error'] = data.error;
            if (data.meta) obj['meta'] = data.meta;
            logger[logLevelToLogger[data.level]](`${dryRun ? '[dry] ' : ''}log: ${data.message}`, Object.keys(obj).length > 0 ? obj : undefined);
        }
        if (dryRun) {
            return true;
        }

        const start = Date.now();
        try {
            await createMessage(getFormattedMessage({ ...data, parentId: operationId }));
            return true;
        } catch (err) {
            report(new Error('failed_to_insert_in_es', { cause: err }));
            return false;
        } finally {
            metrics.duration(metrics.Types.LOGS_LOG, Date.now() - start, { accountId: accountId as number });
        }
    }

    merge(source: LogContextStateless, destination: LogContextStateless): void {
        if (source.transport instanceof BufferTransport) {
            void Promise.all(
                source.transport.buffer.map(async (log) => {
                    await destination.log(log);
                })
            );
        }
    }
}

export class BufferTransport implements LogTransportAbstract {
    buffer: MessageRowInsert[] = [];
    log(msg: MessageRowInsert): boolean {
        this.buffer.push(msg);
        return true;
    }

    merge(source: LogContextStateless): void {
        if (source.transport instanceof BufferTransport) {
            this.buffer.push(...source.transport.buffer);
        }
    }
}
