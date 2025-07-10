import db, { dbNamespace, schema } from '@nangohq/database';

import configService from '../../config.service.js';

import type { HTTP_METHOD } from '../../../models/Generic.js';
import type { DBConnection, DBConnectionDecrypted, DBSyncConfig, DBSyncEndpoint } from '@nangohq/types';

const ENDPOINT_TABLE = dbNamespace + 'sync_endpoints';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';

interface ActionOrModel {
    action?: string;
    model?: string;
}

export async function getActionOrModelByEndpoint(connection: DBConnection | DBConnectionDecrypted, method: HTTP_METHOD, path: string): Promise<ActionOrModel> {
    const config = await configService.getProviderConfig(connection.provider_config_key, connection.environment_id);
    if (!config) {
        throw new Error('Provider config not found');
    }
    const result = await schema()
        .select(`${SYNC_CONFIG_TABLE}.sync_name`, `${ENDPOINT_TABLE}.model as model`, `${SYNC_CONFIG_TABLE}.type`)
        .from<DBSyncConfig>(SYNC_CONFIG_TABLE)
        .join(ENDPOINT_TABLE, `${SYNC_CONFIG_TABLE}.id`, `${ENDPOINT_TABLE}.sync_config_id`)
        .where({
            [`${SYNC_CONFIG_TABLE}.environment_id`]: connection.environment_id,
            [`${SYNC_CONFIG_TABLE}.nango_config_id`]: config.id as number,
            [`${SYNC_CONFIG_TABLE}.active`]: true,
            [`${SYNC_CONFIG_TABLE}.deleted`]: false,
            [`${ENDPOINT_TABLE}.method`]: method,
            [`${ENDPOINT_TABLE}.path`]: path
        })
        .first()
        .orderBy(`${SYNC_CONFIG_TABLE}.id`, 'desc');

    if (!result) {
        return {};
    }
    if (result['type'] == 'action') {
        return { action: result['sync_name'] };
    } else {
        return { model: result['model'] };
    }
}

export async function hardDeleteEndpoints({ syncConfigId }: { syncConfigId: number }): Promise<number> {
    return await db.knex.from<DBSyncEndpoint>('_nango_sync_endpoints').where({ sync_config_id: syncConfigId }).delete();
}
