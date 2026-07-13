import fs from 'node:fs';
import path from 'node:path';

import { configService, getSyncAndActionConfigsBySyncNameAndConfigId, localFileService, onEventScriptService, remoteFileService } from '@nangohq/shared';
import { report, useS3 } from '@nangohq/utils';

import type { RequestLocals } from '../../../../utils/express.js';
import type { DBEnvironment, GetFunctionCode, ScriptTypeLiteral } from '@nangohq/types';
import type { Response } from 'express';

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

interface FunctionMatch {
    type: ScriptTypeLiteral;
    name: string;
    fileLocation: string;
}

async function getFunctionTsCode({ match, providerConfigKey }: { match: FunctionMatch; providerConfigKey: string }): Promise<string | null> {
    if (!useS3) {
        const fileName = `${providerConfigKey}/${scriptTypeToFolder[match.type]}/${match.name}.ts`;
        const check = localFileService.checkForIntegrationSourceFile(fileName);
        if (!check.result) {
            return null;
        }
        return await fs.promises.readFile(check.path, 'utf8');
    }

    const dir = path.dirname(match.fileLocation);
    try {
        return await remoteFileService.getFile(`${dir}/${match.name}.ts`);
    } catch (err) {
        report(err, { providerConfigKey, scriptName: match.name, scriptType: match.type });
        return null;
    }
}

export async function handleGetFunctionCode({
    res,
    environment,
    providerConfigKey,
    name,
    type
}: {
    res: Response<GetFunctionCode['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    providerConfigKey: string;
    name: string;
    type: ScriptTypeLiteral | undefined;
}): Promise<void> {
    const providerConfig = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration '${providerConfigKey}' not found` } });
        return;
    }

    const syncConfigMatches = type === 'on-event' ? [] : await getSyncAndActionConfigsBySyncNameAndConfigId(environment.id, providerConfig.id, name);
    const onEventMatches = type && type !== 'on-event' ? [] : await onEventScriptService.getByConfigAndName(providerConfig.id, name);

    const matches: FunctionMatch[] = [
        ...syncConfigMatches.map((c) => ({ type: c.type, name: c.sync_name, fileLocation: c.file_location })),
        // Multiple on-event rows can share a name (different events) but point to the same TS file, so collapse to one match.
        ...(onEventMatches.length > 0 ? [{ type: 'on-event' as const, name: onEventMatches[0]!.name, fileLocation: onEventMatches[0]!.fileLocation }] : [])
    ];

    const filtered = type ? matches.filter((m) => m.type === type) : matches;

    if (filtered.length > 1) {
        res.status(409).send({
            error: {
                code: 'ambiguous_function',
                message: `Multiple functions named '${name}' found for integration '${providerConfigKey}'. Specify a type to disambiguate.`,
                payload: { matches: filtered.map((m) => ({ type: m.type, name: m.name })) }
            }
        });
        return;
    }

    const match = filtered[0];
    if (!match) {
        res.status(404).send({ error: { code: 'not_found', message: `Function '${name}' not found for integration '${providerConfigKey}'` } });
        return;
    }

    const code = await getFunctionTsCode({ match, providerConfigKey });
    if (code === null) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }

    res.status(200).send({ type: match.type, code });
}
