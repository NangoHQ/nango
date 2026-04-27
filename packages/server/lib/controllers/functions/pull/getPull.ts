import fs from 'fs';

import * as z from 'zod';

import { configService, getSyncAndActionConfigsBySyncNameAndConfigId, localFileService, remoteFileService } from '@nangohq/shared';
import { isEnterprise, isLocal, isTest, useS3, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DBSyncConfig, GetFunctionPull, ScriptTypeLiteral } from '@nangohq/types';

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

const useLocalFiles = isEnterprise ? !useS3 : isLocal || isTest;

async function getFunctionTsCode({ syncConfig, providerConfigKey }: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null> {
    if (useLocalFiles) {
        const nested = `${providerConfigKey}/${scriptTypeToFolder[syncConfig.type]}/${syncConfig.sync_name}.ts`;
        const nestedCheck = localFileService.checkForIntegrationSourceFile(nested);
        if (nestedCheck.result) {
            return await fs.promises.readFile(nestedCheck.path, 'utf8');
        }
        const flat = `${syncConfig.sync_name}.ts`;
        const flatCheck = localFileService.checkForIntegrationSourceFile(flat);
        if (flatCheck.result) {
            return await fs.promises.readFile(flatCheck.path, 'utf8');
        }
        return null;
    }

    const dir = syncConfig.file_location.split('/').slice(0, -1).join('/');
    try {
        return await remoteFileService.getFile(`${dir}/${syncConfig.sync_name}.ts`);
    } catch {
        return null;
    }
}

const validationQuery = z
    .object({
        integrationId: z.string().min(1),
        name: z.string().min(1),
        env: z.string().min(1),
        type: z.enum(['sync', 'action', 'on-event']).optional()
    })
    .strict();

export const getFunctionPull = asyncWrapper<GetFunctionPull>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { integrationId, type, name } = valQuery.data;
    const { environment } = res.locals;

    const providerConfig = await configService.getProviderConfig(integrationId, environment.id);
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration '${integrationId}' not found` } });
        return;
    }

    const matches = await getSyncAndActionConfigsBySyncNameAndConfigId(environment.id, providerConfig.id, name);
    const filtered = type ? matches.filter((c) => c.type === type) : matches;

    if (filtered.length > 1) {
        res.status(409).send({
            error: {
                code: 'ambiguous_function',
                message: `Multiple functions named '${name}' found for integration '${integrationId}'. Specify "type" to disambiguate.`,
                payload: { matches: filtered.map((c) => ({ type: c.type, name: c.sync_name })) }
            }
        });
        return;
    }

    const syncConfig = filtered[0];
    if (!syncConfig) {
        res.status(404).send({ error: { code: 'not_found', message: `Function '${name}' not found for integration '${integrationId}'` } });
        return;
    }

    const code = await getFunctionTsCode({ syncConfig, providerConfigKey: integrationId });
    if (!code) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }

    res.status(200).send({ type: syncConfig.type, code });
});
