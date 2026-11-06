import fs from 'node:fs';
import path from 'node:path';

import db from '@nangohq/database';
import {
    configService,
    functionConfigService,
    functionLookupService,
    functionSourceFile,
    getCatalogTool,
    getSyncConfigById,
    localFileService,
    onEventScriptService,
    remoteFileService
} from '@nangohq/shared';
import { Err, Ok, report, useRemoteStorage } from '@nangohq/utils';

import type { RequestLocalsWithEnvironment } from '../../../../utils/express.js';
import type { Config as ProviderConfig, SourceFileRef } from '@nangohq/shared';
import type { DBEnvironment, FunctionListType, GetFunctionCode, GetPublicFunctionCode, ListedNangoFunction, ScriptTypeLiteral } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Response } from 'express';

type CodeResponse = Response<GetFunctionCode['Reply'], RequestLocalsWithEnvironment> | Response<GetPublicFunctionCode['Reply'], RequestLocalsWithEnvironment>;

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

export async function readFunctionSource(source: SourceFileRef): Promise<Result<string | null>> {
    try {
        if (source.kind === 'remote') {
            return Ok(await remoteFileService.getFile(source.path));
        }
        const file = localFileService.checkForIntegrationSourceFile(source.path);
        return Ok(file.result ? await fs.promises.readFile(file.path, 'utf8') : null);
    } catch (err) {
        return Err(err);
    }
}

function legacySource({
    type,
    name,
    fileLocation,
    providerConfigKey
}: {
    type: ScriptTypeLiteral;
    name: string;
    fileLocation: string;
    providerConfigKey: string;
}): SourceFileRef {
    return useRemoteStorage
        ? { kind: 'remote', path: `${path.dirname(fileLocation)}/${name}.ts` }
        : { kind: 'local', path: `${providerConfigKey}/${scriptTypeToFolder[type]}/${name}.ts` };
}

async function findFunctionSource({
    fn,
    environment,
    providerConfig
}: {
    fn: ListedNangoFunction;
    environment: DBEnvironment;
    providerConfig: ProviderConfig;
}): Promise<Result<SourceFileRef | null>> {
    const providerConfigKey = providerConfig.unique_key;
    if (fn.type === 'tool') {
        const tools = await functionConfigService.search(db.knex, {
            environmentId: environment.id,
            filter: { uuid: fn.uuid }
        });
        if (tools.isErr()) {
            return Err(tools.error);
        }
        const tool = tools.value[0];
        if (!tool) {
            return Ok(null);
        }
        return Ok(functionSourceFile({ integrationId: providerConfigKey, name: fn.name, fileLocation: tool.currentVersion.file_location }));
    }

    if (fn.source === 'tools-catalog') {
        const tool = getCatalogTool(providerConfig.provider, fn.name);
        return Ok(tool ? { kind: 'remote', path: tool.sourceLocation } : null);
    }

    if (fn.type === 'on-event') {
        const [script] = await onEventScriptService.getByConfigAndName(providerConfig.id!, fn.name);
        return Ok(script ? legacySource({ type: 'on-event', name: fn.name, fileLocation: script.fileLocation, providerConfigKey }) : null);
    }

    const config = fn.id === null ? null : await getSyncConfigById(environment.id, fn.id);
    return Ok(config ? legacySource({ type: fn.type, name: fn.name, fileLocation: config.file_location, providerConfigKey }) : null);
}

export async function handleGetFunctionCode({
    res,
    environment,
    providerConfigKey,
    name,
    type
}: {
    res: CodeResponse;
    environment: DBEnvironment;
    providerConfigKey: string;
    name: string;
    type: FunctionListType | undefined;
}): Promise<void> {
    const providerConfig = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration '${providerConfigKey}' not found` } });
        return;
    }

    const fn = await functionLookupService.getFunction({ environmentId: environment.id, providerConfigKey, name, type });
    if (fn.isErr()) {
        report(fn.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get function' } });
        return;
    }
    if (!fn.value) {
        res.status(404).send({ error: { code: 'not_found', message: `Function '${name}' not found for integration '${providerConfigKey}'` } });
        return;
    }

    const source = await findFunctionSource({ fn: fn.value, environment, providerConfig });
    if (source.isErr()) {
        report(source.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get function' } });
        return;
    }
    if (!source.value) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }

    const code = await readFunctionSource(source.value);
    sendFunctionSource({ res, code, isLocal: source.value.kind === 'local', providerConfigKey, name, type: fn.value.type });
}

function sendFunctionSource({
    res,
    code,
    isLocal,
    providerConfigKey,
    name,
    type
}: {
    res: CodeResponse;
    code: Result<string | null>;
    isLocal: boolean;
    providerConfigKey: string;
    name: string;
    type: FunctionListType;
}): void {
    if (code.isErr()) {
        report(code.error, { providerConfigKey, scriptName: name, scriptType: type });
        if (isLocal) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to read source file' } });
            return;
        }
    }
    if (code.isErr() || code.value === null) {
        res.status(404).send({ error: { code: 'not_found', message: `Source file for '${name}' not found` } });
        return;
    }

    res.status(200).send({ type, code: code.value });
}
