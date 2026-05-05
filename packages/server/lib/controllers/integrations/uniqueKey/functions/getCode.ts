import fs from 'node:fs';
import path from 'node:path';

import * as z from 'zod';

import { configService, getSyncAndActionConfigsBySyncNameAndConfigId, localFileService, remoteFileService } from '@nangohq/shared';
import { report, useS3, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DBSyncConfig, GetPublicFunctionCode, ScriptTypeLiteral } from '@nangohq/types';

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

const validationParams = z
    .object({
        uniqueKey: providerConfigKeySchema,
        name: scriptNameSchema
    })
    .strict();

const validationQuery = z
    .object({
        type: z.enum(['sync', 'action', 'on-event']).optional()
    })
    .strict();

export const getFunctionCode = asyncWrapper<GetPublicFunctionCode>(async (req, res) => {
    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { uniqueKey, name } = valParams.data;
    const { type } = valQuery.data;
    const { environment } = res.locals;

    const providerConfig = await configService.getProviderConfig(uniqueKey, environment.id);
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration '${uniqueKey}' not found` } });
        return;
    }

    const matches = await getSyncAndActionConfigsBySyncNameAndConfigId(environment.id, providerConfig.id, name);
    const filtered = type ? matches.filter((c) => c.type === type) : matches;

    if (filtered.length > 1) {
        res.status(409).send({
            error: {
                code: 'ambiguous_function',
                message: `Multiple functions named '${name}' found for integration '${uniqueKey}'. Specify a type to disambiguate.`,
                payload: { matches: filtered.map((c) => ({ type: c.type, name: c.sync_name })) }
            }
        });
        return;
    }

    const syncConfig = filtered[0];
    if (!syncConfig) {
        res.status(404).send({ error: { code: 'not_found', message: `Function '${name}' not found for integration '${uniqueKey}'` } });
        return;
    }

    const code = await getFunctionTsCode({ syncConfig, providerConfigKey: uniqueKey });
    if (code === null) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }

    res.status(200).send({ type: syncConfig.type, code });
});
