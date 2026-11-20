import db from '@nangohq/database';

import { activeSyncConfigBase, activeToolBase, catalogToolsEnabled, markActionsEnabled } from './listing.js';

import type { FunctionSource } from '@nangohq/types';

export interface FunctionAvailabilityRow {
    id: number;
    name: string;
    type: 'sync' | 'action';
    enabled: boolean;
    last_deployed: Date;
    source: FunctionSource;
}

/**
 * Returns unpaginated template availability, including deployed HTTP tool names so
 * action templates shadowed by those tools can be omitted.
 */
export async function findActiveFunctionAvailability({
    environmentId,
    providerConfigKey
}: {
    environmentId: number;
    providerConfigKey: string;
}): Promise<{ deployed: FunctionAvailabilityRow[]; toolNames: string[] }> {
    const [rows, tools, toolsCatalog] = await Promise.all([
        activeSyncConfigBase({ environmentId, providerConfigKeys: [providerConfigKey] })
            .select<FunctionAvailabilityRow[]>('sc.id', 'sc.sync_name AS name', 'sc.type', 'sc.enabled', 'sc.created_at AS last_deployed', 'sc.source')
            .orderBy([
                { column: 'sc.created_at', order: 'asc' },
                { column: 'sc.id', order: 'asc' }
            ]),
        activeToolBase({ environmentId, providerConfigKeys: [providerConfigKey] }).select<{ name: string }[]>('fc.name'),
        db.knex
            .from({ env: '_nango_environments' })
            .join({ account: '_nango_accounts' }, 'env.account_id', 'account.id')
            .where('env.id', environmentId)
            .select<{ account_uuid: string }>(db.knex.raw('account.uuid as account_uuid'))
            .first()
            .then((row) => catalogToolsEnabled(row?.account_uuid))
    ]);
    return { deployed: toolsCatalog ? markActionsEnabled(rows) : rows, toolNames: tools.map(({ name }) => name) };
}
