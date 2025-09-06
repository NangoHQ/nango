import z from 'zod';

import db from '@nangohq/database';
import { connectUISettingsService } from '@nangohq/shared';
import { flagHasPlan, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ConnectUISettings, PutConnectUISettings } from '@nangohq/types';

const colorPaletteSchema = z.strictObject({
    backgroundSurface: z.string(),
    backgroundElevated: z.string(),
    primary: z.string(),
    onPrimary: z.string(),
    textPrimary: z.string(),
    textSecondary: z.string()
});

const bodyValidation = z.strictObject({
    theme: z.strictObject({
        light: colorPaletteSchema,
        dark: colorPaletteSchema
    }),
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

    // Override settings to defaults if the plan does not have the feature
    if (flagHasPlan && !plan?.can_customize_connect_ui_theme) {
        newSettings.theme = connectUISettingsService.defaultConnectUISettings.theme;
    }

    if (flagHasPlan && !plan?.can_disable_connect_ui_watermark) {
        newSettings.showWatermark = connectUISettingsService.defaultConnectUISettings.showWatermark;
    }

    const settings = await connectUISettingsService.upsertConnectUISettings(db.knex, environment.id, body);
    if (settings.isErr()) {
        report(settings.error);
        res.status(500).send({ error: { code: 'failed_to_update_connect_ui_settings', message: settings.error.message } });
        return;
    }

    res.status(200).send({ data: body });
});
