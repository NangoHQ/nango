import { Err, Ok } from '@nangohq/utils';

import type { ConnectUISettings, DBConnectUISettings, Result } from '@nangohq/types';
import type { Knex } from 'knex';

export const defaultConnectUISettings: ConnectUISettings = {
    showWatermark: true,
    theme: {
        light: {
            backgroundSurface: '#ffffff',
            backgroundElevated: '#f9fafb',
            primary: '#00b2e3',
            onPrimary: '#ffffff',
            textPrimary: '#18191b',
            textSecondary: '#626366'
        },
        dark: {
            backgroundSurface: '#0b0b0c',
            backgroundElevated: '#18191b',
            primary: '#00b2e3',
            onPrimary: '#ffffff',
            textPrimary: '#ffffff',
            textSecondary: '#8b8c8f'
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
