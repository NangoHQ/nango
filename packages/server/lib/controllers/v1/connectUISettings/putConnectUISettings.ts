import z from 'zod';

import db from '@nangohq/database';
import { connectUISettingsService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ConnectUISettings, PutConnectUISettings } from '@nangohq/types';

const colorPaletteSchema = z.strictObject({
    primary: z.string()
});

const bodyValidation = z.strictObject({
    theme: z.strictObject({
        light: colorPaletteSchema,
        dark: colorPaletteSchema
    }),
    defaultTheme: z.enum(['light', 'dark', 'system']),
    showWatermark: z.boolean()
});

export const putConnectUISettings = asyncWrapper<PutConnectUISettings>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodyValidation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { environment, plan } = res.locals;
    const body: PutConnectUISettings['Body'] = val.data;

    const newSettings: ConnectUISettings = body;

    const defaultSettings = connectUISettingsService.getDefaultConnectUISettings();

    // Override settings to defaults if the plan does not have the feature
    if (!connectUISettingsService.canCustomizeConnectUITheme(plan)) {
        newSettings.theme = defaultSettings.theme;
    }

    if (!connectUISettingsService.canDisableConnectUIWatermark(plan)) {
        newSettings.showWatermark = defaultSettings.showWatermark;
    }

    const settings = await connectUISettingsService.upsertConnectUISettings(db.knex, environment.id, body);
    if (settings.isErr()) {
        report(settings.error);
        res.status(500).send({ error: { code: 'failed_to_update_connect_ui_settings', message: settings.error.message } });
        return;
    }

    res.status(200).send({ data: body });
});
