import { Err, Ok, flagHasPlan, isEnterprise } from '@nangohq/utils';

import type { ConnectUISettings, DBConnectUISettings, DBPlan, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const defaultConnectUISettings: ConnectUISettings = {
    showWatermark: true,
    defaultTheme: 'system',
    theme: {
        light: {
            primary: '#00B2E3'
        },
        dark: {
            primary: '#00B2E3'
        }
    }
};

export function getDefaultConnectUISettings(): ConnectUISettings {
    return {
        ...defaultConnectUISettings,
        showWatermark: isEnterprise ? false : true
    };
}

export async function getRawConnectUISettings(db: Knex, environmentId: number): Promise<Result<ConnectUISettings | null>> {
    try {
        const settings = await db<DBConnectUISettings>('connect_ui_settings').where('environment_id', environmentId).first();
        if (!settings) {
            return Ok(null);
        }
        return Ok({
            showWatermark: settings.show_watermark,
            theme: settings.theme,
            defaultTheme: settings.default_theme
        });
    } catch (err) {
        return Err(new Error('failed_to_get_connect_ui_settings', { cause: err }));
    }
}

export async function getConnectUISettings(db: Knex, environmentId: number, plan?: DBPlan | null): Promise<Result<ConnectUISettings>> {
    const connectUISettings = await getRawConnectUISettings(db, environmentId);
    if (connectUISettings.isErr()) {
        return Err(connectUISettings.error);
    }

    const defaultSettings = getDefaultConnectUISettings();

    if (!connectUISettings.value) {
        return Ok(defaultSettings);
    }

    const finalSettings = connectUISettings.value;

    // Override settings to defaults if the plan does not have the feature
    // This way if the plan downgrades, they go back to default without resetting settings in db
    if (!canCustomizeConnectUITheme(plan)) {
        finalSettings.theme = defaultSettings.theme;
    }

    if (!canDisableConnectUIWatermark(plan)) {
        finalSettings.showWatermark = defaultSettings.showWatermark;
    }

    return Ok(finalSettings);
}

export async function upsertConnectUISettings(db: Knex, environmentId: number, settings: ConnectUISettings): Promise<Result<void>> {
    try {
        await db<DBConnectUISettings>('connect_ui_settings')
            .insert({
                environment_id: environmentId,
                theme: settings.theme,
                show_watermark: settings.showWatermark,
                default_theme: settings.defaultTheme
            })
            .onConflict('environment_id')
            .merge();
        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_upsert_connect_ui_settings', { cause: err }));
    }
}

export function canCustomizeConnectUITheme(plan?: DBPlan | null): boolean {
    if (!flagHasPlan || !plan) {
        return isEnterprise;
    }

    return plan.can_customize_connect_ui_theme;
}

export function canDisableConnectUIWatermark(plan?: DBPlan | null): boolean {
    if (!flagHasPlan || !plan) {
        return isEnterprise;
    }

    return plan.can_disable_connect_ui_watermark;
}
