import type { Knex } from '@nangohq/database';
import type { DBConnectUISettings } from '@nangohq/types';

export function getConnectUISettings(knex: Knex, environmentId: number): Promise<DBConnectUISettings | null> {
    return knex('connectui_settings').where('environment_id', environmentId).where('deleted', false).first();
}
