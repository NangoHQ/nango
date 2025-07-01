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
            nango_watermark: input.nangoWatermark,
            color_primary: input.colors?.primary,
            color_on_primary: input.colors?.onPrimary,
            color_background: input.colors?.background,
            color_surface: input.colors?.surface,
            color_text: input.colors?.text,
            color_text_muted: input.colors?.textMuted
        })
        .onConflict('environment_id')
        .merge(['nango_watermark', 'color_primary', 'color_on_primary', 'color_background', 'color_surface', 'color_text', 'color_text_muted'])
        .returning('*') as unknown as Promise<DBConnectUISettings | null>;
}
