import * as z from 'zod';

import { configService, getSyncConfigById, remoteFileService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostFlowDownload } from '@nangohq/types';

export const validationParams = z
    .object({
        id: z.coerce.number().positive()
    })
    .strict();

export const postFlowDownload = asyncWrapper<PostFlowDownload>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const { id } = valParams.data;

    const syncConfig = await getSyncConfigById(environment.id, id);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'not_found' } });
        return;
    }

    const providerConfigKey = await configService.getProviderConfigKeyById(environment.id, syncConfig.nango_config_id);
    if (!providerConfigKey) {
        res.status(400).send({ error: { code: 'not_found' } });
        return;
    }

    await remoteFileService.zipAndSendFlow({ res, syncConfig, providerConfigKey });
});
