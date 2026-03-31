import fs from 'node:fs';

import * as z from 'zod';

import { configService, getSyncConfigById, localFileService, remoteFileService } from '@nangohq/shared';
import { integrationFilesAreRemote, isCloud, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetFlowSource } from '@nangohq/types';

const validationParams = z
    .object({
        id: z.coerce.number().positive()
    })
    .strict();

export const getFlowSource = asyncWrapper<GetFlowSource>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { id: syncConfigId } = valParams.data;

    const syncConfig = await getSyncConfigById(environment.id, syncConfigId);
    if (!syncConfig) {
        res.status(404).send({ error: { code: 'not_found' } });
        return;
    }

    const providerConfigKeyResult = await configService.getProviderConfigKeyById(environment.id, syncConfig.nango_config_id);
    if (providerConfigKeyResult.isErr()) {
        res.status(500).send({ error: { code: 'failed_to_get_source' } });
        return;
    }

    const providerConfigKey = providerConfigKeyResult.value;
    if (!providerConfigKey) {
        res.status(404).send({ error: { code: 'not_found' } });
        return;
    }

    let tsCode: string | null = null;

    if (isCloud || integrationFilesAreRemote) {
        const tsFileLocation = syncConfig.file_location.split('/').slice(0, -1).join('/');
        tsCode = await remoteFileService.getFile(`${tsFileLocation}/${syncConfig.sync_name}.ts`);
    } else {
        // Try nested path first (providerConfigKey/syncs|actions/name.ts), then flat (name.ts)
        const scriptType = syncConfig.type === 'action' ? 'actions' : 'syncs';
        const nestedPath = `${providerConfigKey}/${scriptType}/${syncConfig.sync_name}.ts`;
        const nestedCheck = localFileService.checkForIntegrationSourceFile(nestedPath);
        if (nestedCheck.result) {
            tsCode = fs.readFileSync(nestedCheck.path, 'utf8');
        } else {
            const flatCheck = localFileService.checkForIntegrationSourceFile(`${syncConfig.sync_name}.ts`);
            if (flatCheck.result) {
                tsCode = fs.readFileSync(flatCheck.path, 'utf8');
            }
        }
    }

    if (!tsCode) {
        res.status(404).send({ error: { code: 'not_found' } });
        return;
    }

    res.status(200).send({ data: { code: tsCode } });
});
