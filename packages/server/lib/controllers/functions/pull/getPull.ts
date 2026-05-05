import fs from 'node:fs';
import path from 'node:path';

import * as z from 'zod';

import { configService, getSyncAndActionConfigsBySyncNameAndConfigId, localFileService, remoteFileService } from '@nangohq/shared';
import { report, useS3, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DBSyncConfig, GetFunctionPull, ScriptTypeLiteral } from '@nangohq/types';

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

async function getFunctionTsCode({ syncConfig, providerConfigKey }: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null> {
    if (!useS3) {
        const fileName = `${providerConfigKey}/${scriptTypeToFolder[syncConfig.type]}/${syncConfig.sync_name}.ts`;
        const check = localFileService.checkForIntegrationSourceFile(fileName);
        if (!check.result) {
            return null;
        }
        return await fs.promises.readFile(check.path, 'utf8');
    }

    const dir = path.dirname(syncConfig.file_location);
    try {
        return await remoteFileService.getFile(`${dir}/${syncConfig.sync_name}.ts`);
    } catch (err) {
        report(err, { syncConfigId: syncConfig.id, providerConfigKey, syncName: syncConfig.sync_name });
        return null;
    }
}

const validationQuery = z
    .object({
        integrationId: z.string().min(1),
        name: z.string().min(1),
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
                message: `Multiple functions named '${name}' found for integration '${integrationId}'. Specify a type to disambiguate.`,
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
    if (code === null) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }

    res.status(200).send({ type: syncConfig.type, code });
});
