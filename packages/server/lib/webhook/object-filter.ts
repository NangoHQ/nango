import get from 'lodash-es/get.js';

import { metrics } from '@nangohq/utils';

import type { DispatchContext, WebhookConnection } from './dispatch.js';

export interface WebhookObjectFilter {
    /** Path in the payload holding the id of the object the event belongs to. */
    path: string;
    /** Sync name to the connection metadata key holding the id of the object that sync tracks. */
    metadataKeyBySyncName: Record<string, string>;
}

export type ObjectFilterResult = 'skipped' | 'no_sync_mapping' | 'no_payload_value' | 'no_metadata' | 'matched';

/**
 * Only a present and different metadata value skips. Anything missing falls open, so a wrong
 * or absent mapping costs the saving and never drops an event.
 */
export function evaluateObjectFilter({
    filter,
    syncName,
    connection,
    payload
}: {
    filter: WebhookObjectFilter;
    syncName: string;
    connection: WebhookConnection;
    payload: Record<string, unknown>;
}): ObjectFilterResult {
    const metadataKey = filter.metadataKeyBySyncName[syncName];
    if (!metadataKey) {
        return 'no_sync_mapping';
    }

    const metadata = 'metadata' in connection ? connection.metadata : null;
    const expected = metadata?.[metadataKey];
    if (!isComparable(expected)) {
        return 'no_metadata';
    }

    const actual: unknown = get(payload, filter.path);
    if (!isComparable(actual)) {
        return 'no_payload_value';
    }

    return String(expected) === String(actual) ? 'matched' : 'skipped';
}

export function shouldDispatchForObject({
    context,
    filter,
    syncName,
    connection,
    payload
}: {
    context: DispatchContext;
    filter: WebhookObjectFilter | undefined;
    syncName: string;
    connection: WebhookConnection;
    payload: Record<string, unknown>;
}): boolean {
    if (!filter) {
        return true;
    }

    const result = evaluateObjectFilter({ filter, syncName, connection, payload });
    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_OBJECT_FILTER, 1, {
        provider: context.integration.provider,
        accountId: context.team.id,
        result
    });

    return result !== 'skipped';
}

function isComparable(value: unknown): value is string | number {
    return (typeof value === 'string' && value !== '') || typeof value === 'number';
}
