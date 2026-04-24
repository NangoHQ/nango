import fs from 'fs';

import * as z from 'zod';

import { configService, getSyncConfigRaw, localFileService, remoteFileService } from '@nangohq/shared';
import { isEnterprise, isLocal, isTest, useS3, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DBSyncConfig, GetFunctionPull, ScriptTypeLiteral } from '@nangohq/types';

const folderTypeToScriptType: Record<string, ScriptTypeLiteral> = {
    syncs: 'sync',
    actions: 'action',
    'on-events': 'on-event'
};

const scriptTypeToFolder: Record<ScriptTypeLiteral, string> = {
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
        type: z.enum(['syncs', 'actions', 'on-events']),
        name: z.string().min(1),
        env: z.string().optional()
    })
    .strict();

export const getFunctionPull = asyncWrapper<GetFunctionPull>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { integrationId, type, name, env } = valQuery.data;
    const { environment } = res.locals;

    if (!env) {
        // Catalog mode: fetch TS source from S3 templates-zero
        const s3Key = `templates-zero/${integrationId}/${type}/${name}.ts`;
        try {
            const content = await remoteFileService.getFile(s3Key);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.status(200).end(content);
        } catch {
            res.status(404).send({ error: { code: 'not_found', message: `Catalog function '${integrationId}/${type}/${name}' not found` } });
        }
        return;
    }

    // Deployed mode: look up in DB by providerConfigKey + name + type
    const scriptType = folderTypeToScriptType[type]!;

    const providerConfig = await configService.getProviderConfig(integrationId, environment.id);
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration '${integrationId}' not found` } });
        return;
    }

    const syncConfig = await getSyncConfigRaw({
        environmentId: environment.id,
        config_id: providerConfig.id,
        name,
        type: scriptType
    });

    if (!syncConfig) {
        res.status(404).send({ error: { code: 'not_found', message: `Function '${name}' not found for integration '${integrationId}'` } });
        return;
    }

    const content = await getFunctionTsCode({ syncConfig, providerConfigKey: integrationId });
    if (!content) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).end(content);
});
