import { flags } from '@nangohq/utils';

import { getSyncConfigRaw } from '../sync/config/config.service.js';
import { catalogActionJsPath, getCatalogAction } from './actions.js';

import type { CatalogAction } from './actions.js';
import type { DBSyncConfig, IntegrationConfig } from '@nangohq/types';

export type ResolveRunnableActionResult =
    | { kind: 'deployed'; config: DBSyncConfig }
    | { kind: 'catalog'; config: DBSyncConfig; catalog: CatalogAction }
    | { kind: 'missing' };

export async function resolveRunnableAction({
    environmentId,
    integration,
    name
}: {
    environmentId: number;
    integration: Pick<IntegrationConfig, 'id' | 'provider'>;
    name: string;
}): Promise<ResolveRunnableActionResult> {
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

    const catalog = getCatalogAction(integration.provider, name);
    if (!catalog) {
        return { kind: 'missing' };
    }

    return { kind: 'catalog', config: toSyntheticSyncConfig({ environmentId, configId, provider: integration.provider, catalog }), catalog };
}

function toSyntheticSyncConfig({
    environmentId,
    configId,
    provider,
    catalog
}: {
    environmentId: number;
    configId: number;
    provider: string;
    catalog: CatalogAction;
}): DBSyncConfig {
    const now = new Date();
    return {
        id: 0,
        sync_name: catalog.name,
        nango_config_id: configId,
        file_location: catalogActionJsPath({ provider, name: catalog.name }),
        version: catalog.version || '0.0.1',
        models: catalog.output,
        active: true,
        runs: null,
        model_schema: null,
        environment_id: environmentId,
        track_deletes: false,
        type: 'action',
        auto_start: false,
        attributes: {},
        source: 'catalog',
        metadata: { description: catalog.description, scopes: catalog.scopes },
        input: catalog.input,
        sync_type: null,
        webhook_subscriptions: null,
        enabled: true,
        models_json_schema: catalog.json_schema,
        sdk_version: catalog.sdk_version,
        features: catalog.features,
        created_at: now,
        updated_at: now,
        deleted: false,
        deleted_at: null
    };
}
