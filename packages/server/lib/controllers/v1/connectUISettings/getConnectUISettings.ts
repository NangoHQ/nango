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

    const { environment } = res.locals;

    const connectUISettings = await connectUISettingsService.getConnectUISettings(db.knex, environment.id);
    if (connectUISettings.isErr()) {
        report(connectUISettings.error);
        res.status(500).send({ error: { code: 'failed_to_get_connect_ui_settings', message: connectUISettings.error.message } });
        return;
    }

    const settings = connectUISettings.value ?? connectUISettingsService.defaultConnectUISettings;
    res.status(200).send({ data: settings });
});
