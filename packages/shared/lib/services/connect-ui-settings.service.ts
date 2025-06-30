import db from '@nangohq/database';
import type { DBConnectUISettings } from '@nangohq/types';
import type { CreateConnectUISettingsInput } from '@nangohq/types/lib/connect-ui-settings/dto.js';

export function getConnectUISettings(environmentId: number): Promise<DBConnectUISettings | null> {
    return db.knex('connectui_settings').where('environment_id', environmentId).where('deleted', false).first();
}

export function upsertConnectUISettings(environmentId: number, input: CreateConnectUISettingsInput): Promise<DBConnectUISettings | null> {
    return db
        .knex('connectui_settings')
        .insert({
            environment_id: environmentId,
            primary_color: input.primaryColor
        })
        .onConflict('environment_id')
        .merge(['primary_color'])
        .returning('*') as unknown as Promise<DBConnectUISettings | null>;
}
