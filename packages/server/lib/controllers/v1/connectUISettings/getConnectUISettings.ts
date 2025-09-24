import db from '@nangohq/database';
import { connectUISettingsService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetConnectUISettings } from '@nangohq/types';

export const getConnectUISettings = asyncWrapper<GetConnectUISettings>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment, plan } = res.locals;

    const connectUISettings = await connectUISettingsService.getConnectUISettings(db.knex, environment.id);
    if (connectUISettings.isErr()) {
        report(connectUISettings.error);
        res.status(500).send({ error: { code: 'failed_to_get_connect_ui_settings', message: connectUISettings.error.message } });
        return;
    }

    const defaultSettings = connectUISettingsService.getDefaultConnectUISettings();

    if (!connectUISettings.value) {
        res.status(200).send({ data: defaultSettings });
        return;
    }

    const finalSettings = connectUISettings.value;

    // Override settings to defaults if the plan does not have the feature
    // This way if the plan downgrades, they go back to default without resetting settings in db
    if (!connectUISettingsService.canCustomizeConnectUITheme(plan)) {
        finalSettings.theme = defaultSettings.theme;
    }

    if (!connectUISettingsService.canDisableConnectUIWatermark(plan)) {
        finalSettings.showWatermark = defaultSettings.showWatermark;
    }

    res.status(200).send({ data: finalSettings });
});
