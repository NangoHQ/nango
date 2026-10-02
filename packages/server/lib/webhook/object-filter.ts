import get from 'lodash-es/get.js';

import { metrics } from '@nangohq/utils';

import type { DispatchContext, WebhookConnection } from './dispatch.js';

export const WEBHOOK_OBJECT_ID_METADATA_PREFIX = 'nango:webhookObjectId:';

export interface WebhookObjectFilter {
    /** Path in the payload holding the id of the object the event belongs to. */
    path: string;
    /** When false, results are only measured and every execution is dispatched. */
    enforce: boolean;
    /** Sync name to metadata key, read when the documented key is absent. */
    metadataKeyAliases?: Record<string, string>;
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
    const metadata = 'metadata' in connection ? connection.metadata : null;
    if (!metadata || Object.keys(metadata).length === 0) {
        return 'no_metadata';
    }

    const expected = metadata[`${WEBHOOK_OBJECT_ID_METADATA_PREFIX}${syncName}`] ?? aliasedValue(metadata, filter.metadataKeyAliases?.[syncName]);
    if (!isComparable(expected)) {
        return 'no_sync_mapping';
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
        result,
        enforced: String(filter.enforce)
    });

    return !(filter.enforce && result === 'skipped');
}

function aliasedValue(metadata: Record<string, unknown>, key: string | undefined): unknown {
    return key ? metadata[key] : undefined;
}

function isComparable(value: unknown): value is string | number {
    return (typeof value === 'string' && value !== '') || typeof value === 'number';
}
