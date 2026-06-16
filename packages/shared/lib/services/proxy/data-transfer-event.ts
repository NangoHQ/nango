import type { MeteredBytes } from './byte-metering-transport.js';
import type { UsageDataTransferEvent } from '@nangohq/types';

export function makeDataTransferEvents(
    pkg: 'runner' | 'server' | 'shared',
    callsite: string,
    accountId: number,
    connectionId: string,
    integrationId: string,
    environmentId: number,
    meteredBytes: MeteredBytes,
    environmentName?: string,
    syncId?: string
): Omit<UsageDataTransferEvent, 'idempotencyKey' | 'createdAt'>[] {
    const events = [
        { direction: 'ingress' as const, bytes: meteredBytes.received },
        { direction: 'egress' as const, bytes: meteredBytes.sent }
    ]
        .filter((e) => e.bytes > 0)
        .map((event) => ({
            subject: 'usage' as const,
            type: 'usage.data_transfer' as const,
            payload: {
                value: event.bytes,
                properties: {
                    package: pkg,
                    accountId,
                    environmentId,
                    environmentName: environmentName ?? '',
                    integrationId,
                    connectionId,
                    callsite,
                    direction: event.direction,
                    ...(syncId ? { syncId } : {})
                }
            }
        }));

    return events;
}
