import { Err, Ok } from '@nangohq/utils';

import type { ConnectUISettings, DBConnectUISettings, Result } from '@nangohq/types';
import type { Knex } from 'knex';

export const defaultConnectUISettings: ConnectUISettings = {
    showWatermark: true,
    theme: {
        light: {
            buttonBackground: '#00B2E3',
            buttonText: '#ffffff'
        },
        dark: {
            buttonBackground: '#00B2E3',
            buttonText: '#ffffff'
        }
    }
};

export async function getConnectUISettings(db: Knex, environmentId: number): Promise<Result<ConnectUISettings | null>> {
    try {
        const settings = await db<DBConnectUISettings>('connect_ui_settings').where('environment_id', environmentId).first();
        if (!settings) {
            return Ok(null);
        }
        return Ok({
            showWatermark: settings.show_watermark,
            theme: settings.theme
        });
    } catch (err) {
        return Err(new Error('failed_to_get_connect_ui_settings', { cause: err }));
    }
}

export async function upsertConnectUISettings(db: Knex, environmentId: number, settings: ConnectUISettings): Promise<Result<void>> {
    try {
        await db<DBConnectUISettings>('connect_ui_settings')
            .insert({
                environment_id: environmentId,
                theme: settings.theme,
                show_watermark: settings.showWatermark
            })
            .onConflict('environment_id')
            .merge();
        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_upsert_connect_ui_settings', { cause: err }));
    }
}
