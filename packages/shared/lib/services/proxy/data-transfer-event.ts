import type { MeteredBytes } from './byte-metering-transport.js';
import type { DataTransferCallsite, UsageDataTransferEvent } from '@nangohq/types';

const billableSources = new Set([
    'server.get_/records',
    'server.get_/proxy',
    'server.post_/proxy',
    'server.patch_/proxy',
    'server.put_/proxy',
    'server.delete_/proxy',
    'server.unknown_/proxy',
    'server.proxy',
    'server.webhook_forward',
    'runner.proxy',
    'runner.uncontrolled_fetch',
    'runner.persist_customer_logs',
    'runner.persist_records'
]);

export function isBillableDataTransfer(pkg: 'runner' | 'server' | 'shared', callsite: DataTransferCallsite): boolean {
    return billableSources.has(`${pkg}.${callsite}`);
}

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
    callsite: DataTransferCallsite;
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
