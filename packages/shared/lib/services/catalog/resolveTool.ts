import { flags } from '@nangohq/utils';

import { getSyncConfigRaw } from '../sync/config/config.service.js';
import { getCatalogTool } from './actions.js';

import type { CatalogTool } from './actions.js';
import type { DBSyncConfig, IntegrationConfig } from '@nangohq/types';

export type ResolveRunnableToolResult = { kind: 'deployed'; config: DBSyncConfig } | { kind: 'catalog'; tool: CatalogTool } | { kind: 'missing' };

export async function resolveRunnableTool({
    environmentId,
    integration,
    name
}: {
    environmentId: number;
    integration: Pick<IntegrationConfig, 'id' | 'provider'>;
    name: string;
}): Promise<ResolveRunnableToolResult> {
    const configId = integration.id;
    if (!configId) {
        return { kind: 'missing' };
    }

    const deployed = await getSyncConfigRaw({ environmentId, config_id: configId, name, isAction: true });
    if (deployed) {
        return { kind: 'deployed', config: deployed };
    }

    if (!flags.hasLiveCatalogActions) {
        return { kind: 'missing' };
    }

    const tool = getCatalogTool(integration.provider, name);
    if (!tool) {
        return { kind: 'missing' };
    }

    return { kind: 'catalog', tool };
}
