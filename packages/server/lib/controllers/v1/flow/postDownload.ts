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
    const { id: syncConfigId } = valParams.data;

    const syncConfig = await getSyncConfigById(environment.id, syncConfigId);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'not_found' } });
        return;
    }

    const providerConfigKeyResult = await configService.getProviderConfigKeyById(environment.id, syncConfig.nango_config_id);
    if (providerConfigKeyResult.isErr()) {
        res.status(500).send({ error: { code: 'failed_to_download_flow' } });
        return;
    }

    const providerConfigKey = providerConfigKeyResult.value;
    if (!providerConfigKey) {
        res.status(400).send({ error: { code: 'not_found' } });
        return;
    }

    await remoteFileService.zipAndSendFlow({ res, syncConfig, providerConfigKey });
});
