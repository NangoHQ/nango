import { getFlags } from '@nangohq/feature-flags';

import { getSyncConfigRaw } from '../sync/config/config.service.js';
import { getCatalogTool } from './actions.js';

import type { CatalogTool } from './actions.js';
import type { DBSyncConfig, IntegrationConfig } from '@nangohq/types';

export type ResolvedLegacyAction = { kind: 'deployed'; config: DBSyncConfig } | { kind: 'catalog'; tool: CatalogTool } | { kind: 'missing' };

export async function resolveLegacyAction({
    accountUuid,
    environmentId,
    integration,
    name
}: {
    accountUuid: string;
    environmentId: number;
    integration: Pick<IntegrationConfig, 'id' | 'provider'>;
    name: string;
}): Promise<ResolvedLegacyAction> {
    const configId = integration.id;
    if (!configId) {
        return { kind: 'missing' };
    }

    const deployed = await getSyncConfigRaw({ environmentId, config_id: configId, name, isAction: true });
    if (deployed) {
        if (!deployed.enabled && (await getFlags().hasCatalogTools(accountUuid))) {
            return { kind: 'deployed', config: { ...deployed, enabled: true } };
        }
        return { kind: 'deployed', config: deployed };
    }

    const tool = getCatalogTool(integration.provider, name);
    if (!tool || !(await getFlags().hasCatalogTools(accountUuid))) {
        return { kind: 'missing' };
    }

    return { kind: 'catalog', tool };
}
