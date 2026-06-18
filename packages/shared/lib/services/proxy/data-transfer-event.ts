import type { MeteredBytes } from './byte-metering-transport.js';
import type { UsageDataTransferEvent } from '@nangohq/types';

export function makeDataTransferEvent({
    pkg,
    callsite,
    accountId,
    connectionId,
    integrationId,
    environmentId,
    meteredBytes,
    environmentName,
    syncId,
    count = 1
}: {
    pkg: 'runner' | 'server' | 'shared';
    callsite: string;
    accountId: number;
    connectionId: string;
    integrationId: string;
    environmentId: number;
    meteredBytes: MeteredBytes;
    environmentName?: string;
    syncId?: string;
    count?: number;
}): Omit<UsageDataTransferEvent, 'idempotencyKey' | 'createdAt'> {
    return {
        subject: 'usage' as const,
        type: 'usage.data_transfer' as const,
        payload: {
            value: count,
            properties: {
                package: pkg,
                accountId,
                environmentId,
                environmentName: environmentName ?? '',
                integrationId,
                connectionId,
                callsite,
                ingressedBytes: meteredBytes.received,
                egressedBytes: meteredBytes.sent,
                ...(syncId ? { syncId } : {})
            }
        }
    };
}
