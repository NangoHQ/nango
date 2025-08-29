import z from 'zod';

import db from '@nangohq/database';
import { connectUISettingsService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PutConnectUISettings } from '@nangohq/types';

const colorPaletteSchema = z
    .object({
        background: z.string(),
        foreground: z.string(),
        primary: z.string(),
        primaryForeground: z.string(),
        textPrimary: z.string(),
        textMuted: z.string()
    })
    .strict();

const bodyValidation = z
    .object({
        theme: z
            .object({
                light: colorPaletteSchema,
                dark: colorPaletteSchema
            })
            .strict(),
        showWatermark: z.boolean()
    })
    .strict();

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

    const { environment } = res.locals;
    const body: PutConnectUISettings['Body'] = val.data;

    const settings = await connectUISettingsService.upsertConnectUISettings(db.knex, environment.id, body);
    if (settings.isErr()) {
        report(settings.error);
        res.status(500).send({ error: { code: 'failed_to_update_connect_ui_settings', message: settings.error.message } });
        return;
    }

    res.status(200).send({ data: body });
});
