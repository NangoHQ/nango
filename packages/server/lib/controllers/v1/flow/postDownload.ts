import * as z from 'zod';

import { flowService, getSyncConfigById, remoteFileService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, providerSchema, scriptNameSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { flowConfig } from '../../sync/deploy/validation.js';

import type { PostFlowDownload } from '@nangohq/types';

const validation = z
    .object({
        id: z.number().optional(),
        name: scriptNameSchema,
        provider: providerSchema,
        is_public: z.boolean(),
        providerConfigKey: providerConfigKeySchema,
        flowType: flowConfig.shape.type
    })
    .strict();

export const postFlowDownload = asyncWrapper<PostFlowDownload>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const body: PostFlowDownload['Body'] = val.data;
    const { environment } = res.locals;
    const { id, name, provider, is_public, providerConfigKey, flowType } = body;

    if (!id && is_public) {
        const flow = flowService.getFlowByIntegrationAndName({ provider, type: flowType, scriptName: name });
        if (!flow) {
            res.status(400).send({ error: { code: 'invalid_query' } });
            return;
        }
        await remoteFileService.zipAndSendPublicFiles({ res, scriptName: name, providerPath: provider, flowType });
        return;
    }

    const syncConfig = await getSyncConfigById(environment.id, id as number);
    if (!syncConfig) {
        res.status(400).send({ error: { code: 'invalid_file_reference' } });
        return;
    }

    await remoteFileService.zipAndSendFiles({ res, scriptName: name, syncConfig, providerConfigKey });
});
